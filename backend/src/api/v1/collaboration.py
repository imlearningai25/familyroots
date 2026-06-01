"""Collaboration API — members, invitations, audit log, version history."""
from __future__ import annotations

import uuid
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from pydantic import BaseModel, EmailStr, Field

from src.api.deps import CurrentUserDep, UoWDep
from src.application.collaboration.service import CollaborationService
from src.domain.collaboration.entities import (
    Action, AuditEntityType, AuditEntry, Invitation,
    PersonVersion, TreeMembership, TreeRole,
)
from src.domain.collaboration.exceptions import (
    AlreadyMemberError, CannotDowngradeOwnerError, CannotRemoveOwnerError,
    InsufficientPermissionError, InvitationAlreadyUsedError,
    InvitationExpiredError, InvitationNotFoundError,
)

router = APIRouter(tags=["collaboration"])


# ── Dependency ─────────────────────────────────────────────────────────────────

async def get_collaboration_service(uow: UoWDep) -> CollaborationService:
    return CollaborationService(uow.session)

CollabDep = Annotated[CollaborationService, Depends(get_collaboration_service)]


# ── Schemas ────────────────────────────────────────────────────────────────────

class MemberResponse(BaseModel):
    id: uuid.UUID
    tree_id: uuid.UUID
    user_id: uuid.UUID
    role: TreeRole
    joined_at: Optional[str]
    email: str = ""
    display_name: str = ""

    @classmethod
    def from_domain(cls, m: TreeMembership) -> "MemberResponse":
        return cls(
            id=m.id,
            tree_id=m.tree_id,
            user_id=m.user_id,
            role=m.role,
            joined_at=m.joined_at.isoformat() if m.joined_at else None,
        )


class ChangeRoleRequest(BaseModel):
    role: TreeRole


class InviteRequest(BaseModel):
    email: EmailStr
    role: TreeRole = TreeRole.VIEWER
    message: Optional[str] = Field(None, max_length=500)


class InvitationResponse(BaseModel):
    id: uuid.UUID
    tree_id: uuid.UUID
    invitee_email: str
    role: TreeRole
    status: str
    expires_at: str
    created_at: str

    @classmethod
    def from_domain(cls, i: Invitation) -> "InvitationResponse":
        return cls(
            id=i.id,
            tree_id=i.tree_id,
            invitee_email=i.invitee_email,
            role=i.role,
            status=i.status.value,
            expires_at=i.expires_at.isoformat(),
            created_at=i.created_at.isoformat(),
        )


class AcceptInvitationRequest(BaseModel):
    token: str


class AuditEntryResponse(BaseModel):
    id: uuid.UUID
    actor_display_name: str
    action: str
    entity_type: str
    entity_id: Optional[uuid.UUID]
    entity_display_name: Optional[str]
    before: Optional[dict]
    after: Optional[dict]
    occurred_at: str

    @classmethod
    def from_domain(cls, e: AuditEntry) -> "AuditEntryResponse":
        return cls(
            id=e.id,
            actor_display_name=e.actor_display_name,
            action=e.action.value,
            entity_type=e.entity_type.value,
            entity_id=e.entity_id,
            entity_display_name=e.entity_display_name,
            before=e.before,
            after=e.after,
            occurred_at=e.occurred_at.isoformat(),
        )


class PersonVersionResponse(BaseModel):
    id: uuid.UUID
    version_number: int
    change_summary: str
    created_by_id: uuid.UUID
    created_at: str
    snapshot: dict

    @classmethod
    def from_domain(cls, v: PersonVersion) -> "PersonVersionResponse":
        return cls(
            id=v.id,
            version_number=v.version_number,
            change_summary=v.change_summary,
            created_by_id=v.created_by_id,
            created_at=v.created_at.isoformat(),
            snapshot=v.snapshot,
        )


# ── Tree listing ───────────────────────────────────────────────────────────────

class TreeSummaryResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str]
    role: TreeRole
    person_count: int
    member_count: int


class CreateTreeRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)


@router.post("/trees", response_model=TreeSummaryResponse, status_code=status.HTTP_201_CREATED, summary="Create a new family tree")
async def create_tree(
    body: CreateTreeRequest,
    current_user: CurrentUserDep,
    uow: UoWDep,
) -> TreeSummaryResponse:
    from sqlalchemy import text

    tree_id = uuid.uuid4()

    await uow._session.execute(text("""
        INSERT INTO family_trees (id, tenant_id, name, description)
        VALUES (:id, :tenant_id, :name, :description)
    """), {"id": tree_id, "tenant_id": current_user.tenant_id, "name": body.name, "description": body.description})

    await uow._session.execute(text("""
        INSERT INTO tree_members (id, tree_id, user_id, tenant_id, role, joined_at)
        VALUES (:id, :tree_id, :user_id, :tenant_id, 'OWNER', NOW())
    """), {"id": uuid.uuid4(), "tree_id": tree_id, "user_id": current_user.id, "tenant_id": current_user.tenant_id})

    return TreeSummaryResponse(
        id=tree_id,
        name=body.name,
        description=body.description,
        role=TreeRole.OWNER,
        person_count=0,
        member_count=1,
    )


@router.delete(
    "/trees/{tree_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    response_class=Response,
    summary="Soft-delete a tree (owner only)",
)
async def delete_tree(
    tree_id: uuid.UUID,
    current_user: CurrentUserDep,
    uow: UoWDep,
) -> None:
    from sqlalchemy import text

    row = (await uow._session.execute(
        text("SELECT role FROM tree_members WHERE tree_id = :tid AND user_id = :uid LIMIT 1"),
        {"tid": tree_id, "uid": current_user.id},
    )).first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tree not found")
    if row.role != "OWNER":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the tree owner can delete this tree")

    await uow._session.execute(
        text("UPDATE family_trees SET is_deleted = true WHERE id = :tid"),
        {"tid": tree_id},
    )


@router.get("/trees", response_model=list[TreeSummaryResponse], summary="List trees the current user belongs to")
async def list_my_trees(
    current_user: CurrentUserDep,
    uow: UoWDep,
) -> list[TreeSummaryResponse]:
    from sqlalchemy import select, func, text
    from sqlalchemy.sql import literal_column

    # Trees where the current user is a member
    q = text("""
        SELECT
            ft.id,
            ft.name,
            ft.description,
            tm.role,
            (SELECT COUNT(*) FROM persons p WHERE p.tree_id = ft.id AND p.is_deleted = false) AS person_count,
            (SELECT COUNT(*) FROM tree_members m WHERE m.tree_id = ft.id) AS member_count
        FROM family_trees ft
        JOIN tree_members tm ON tm.tree_id = ft.id
        WHERE tm.user_id = :user_id
          AND ft.is_deleted = false
        ORDER BY ft.created_at DESC
    """)
    result = await uow._session.execute(q, {"user_id": current_user.id})
    rows = result.fetchall()
    return [
        TreeSummaryResponse(
            id=row.id,
            name=row.name,
            description=row.description,
            role=TreeRole(row.role),
            person_count=row.person_count,
            member_count=row.member_count,
        )
        for row in rows
    ]


# ── Tree graph ─────────────────────────────────────────────────────────────────

@router.get("/trees/{tree_id}/graph", summary="Full person + family-group graph for canvas rendering")
async def get_tree_graph(
    tree_id: uuid.UUID,
    current_user: CurrentUserDep,
    uow: UoWDep,
) -> dict:
    from sqlalchemy import text

    # Verify membership
    membership_q = text(
        "SELECT 1 FROM tree_members WHERE tree_id = :tid AND user_id = :uid LIMIT 1"
    )
    row = (await uow._session.execute(membership_q, {"tid": tree_id, "uid": current_user.id})).first()
    if row is None:
        raise HTTPException(403, "Not a member of this tree")

    # Persons
    persons_q = text("""
        SELECT id, tree_id, display_given_name, display_surname,
               sex, is_living, is_deceased
        FROM persons
        WHERE tree_id = :tid AND is_deleted = false
        ORDER BY display_surname, display_given_name
    """)
    person_rows = (await uow._session.execute(persons_q, {"tid": tree_id})).fetchall()

    persons = [
        {
            "id": str(r.id),
            "treeId": str(r.tree_id),
            "displayGivenName": r.display_given_name,
            "displaySurname": r.display_surname,
            "sex": r.sex,
            "isLiving": r.is_living,
            "isDeceased": r.is_deceased,
        }
        for r in person_rows
    ]

    # Family groups + members
    fg_q = text("""
        SELECT fg.id, fg.tree_id, fg.union_type,
               fgm.person_id, fgm.role, fgm.parentage_type
        FROM family_groups fg
        LEFT JOIN family_group_members fgm ON fgm.family_group_id = fg.id
        LEFT JOIN persons p ON p.id = fgm.person_id
        WHERE fg.tree_id = :tid
          AND (fgm.person_id IS NULL OR p.is_deleted = false)
        ORDER BY fg.id
    """)
    fg_rows = (await uow._session.execute(fg_q, {"tid": tree_id})).fetchall()

    groups: dict[str, dict] = {}
    for r in fg_rows:
        gid = str(r.id)
        if gid not in groups:
            groups[gid] = {
                "id": gid,
                "treeId": str(r.tree_id),
                "unionType": r.union_type,
                "parentIds": [],
                "children": {},
            }
        if r.person_id is None:
            continue
        pid = str(r.person_id)
        if r.role == "PARENT":
            if pid not in groups[gid]["parentIds"]:
                groups[gid]["parentIds"].append(pid)
        elif r.role == "CHILD":
            groups[gid]["children"][pid] = r.parentage_type or "BIOLOGICAL"

    return {
        "treeId": str(tree_id),
        "persons": persons,
        "familyGroups": list(groups.values()),
    }


# ── Members ────────────────────────────────────────────────────────────────────

@router.get("/trees/{tree_id}/members", response_model=list[MemberResponse])
async def list_members(
    tree_id: uuid.UUID,
    current_user: CurrentUserDep,
    uow: UoWDep,
) -> list[MemberResponse]:
    from sqlalchemy import text

    # Verify caller is a member
    check = (await uow._session.execute(
        text("SELECT 1 FROM tree_members WHERE tree_id = :tid AND user_id = :uid LIMIT 1"),
        {"tid": tree_id, "uid": current_user.id},
    )).first()
    if check is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not a member of this tree")

    rows = (await uow._session.execute(text("""
        SELECT
            tm.id, tm.tree_id, tm.user_id, tm.role, tm.joined_at,
            u.email,
            COALESCE(NULLIF(TRIM(CONCAT(u.given_name, ' ', u.family_name)), ''), u.email) AS display_name
        FROM tree_members tm
        JOIN users u ON u.id = tm.user_id
        WHERE tm.tree_id = :tid
        ORDER BY
            CASE tm.role WHEN 'OWNER' THEN 0 WHEN 'ADMIN' THEN 1 WHEN 'EDITOR' THEN 2 ELSE 3 END,
            tm.joined_at
    """), {"tid": tree_id})).fetchall()

    return [
        MemberResponse(
            id=r.id,
            tree_id=r.tree_id,
            user_id=r.user_id,
            role=TreeRole(r.role),
            joined_at=r.joined_at.isoformat() if r.joined_at else None,
            email=r.email,
            display_name=r.display_name,
        )
        for r in rows
    ]


@router.patch("/trees/{tree_id}/members/{user_id}/role", status_code=status.HTTP_204_NO_CONTENT, response_model=None, response_class=Response)
async def change_member_role(
    tree_id: uuid.UUID,
    user_id: uuid.UUID,
    body: ChangeRoleRequest,
    request: Request,
    current_user: CurrentUserDep,
    svc: CollabDep,
) -> None:
    await svc.change_member_role(
        tree_id=tree_id,
        target_user_id=user_id,
        new_role=body.role,
        actor_id=current_user.id,
        actor_name=current_user.display_name,
        ip_address=request.client.host if request.client else None,
    )


@router.delete("/trees/{tree_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None, response_class=Response)
async def remove_member(
    tree_id: uuid.UUID,
    user_id: uuid.UUID,
    request: Request,
    current_user: CurrentUserDep,
    svc: CollabDep,
    uow: UoWDep,
) -> None:
    await svc.remove_member(
        tree_id=tree_id,
        target_user_id=user_id,
        actor_id=current_user.id,
        actor_name=current_user.display_name,
        tenant_id=current_user.tenant_id,
        ip_address=request.client.host if request.client else None,
    )


# ── Invitations ────────────────────────────────────────────────────────────────

@router.get("/trees/{tree_id}/invitations", response_model=list[InvitationResponse])
async def list_invitations(
    tree_id: uuid.UUID,
    current_user: CurrentUserDep,
    svc: CollabDep,
) -> list[InvitationResponse]:
    await svc.require_permission(tree_id, current_user.id, Action.VIEW_MEMBERS)
    from src.infrastructure.repositories.collaboration import InvitationRepository
    repo = InvitationRepository(svc._session)
    invitations = await repo.list_by_tree(tree_id)
    return [InvitationResponse.from_domain(i) for i in invitations]


@router.post("/trees/{tree_id}/invitations", response_model=InvitationResponse, status_code=status.HTTP_201_CREATED)
async def send_invitation(
    tree_id: uuid.UUID,
    body: InviteRequest,
    request: Request,
    current_user: CurrentUserDep,
    svc: CollabDep,
) -> InvitationResponse:
    invitation = await svc.send_invitation(
        tree_id=tree_id,
        tenant_id=current_user.tenant_id,
        actor_id=current_user.id,
        actor_name=current_user.display_name,
        invitee_email=body.email,
        role=body.role,
        message=body.message,
        ip_address=request.client.host if request.client else None,
    )
    # TODO: dispatch email via background task
    return InvitationResponse.from_domain(invitation)


@router.post("/invitations/accept", response_model=MemberResponse)
async def accept_invitation(
    body: AcceptInvitationRequest,
    request: Request,
    current_user: CurrentUserDep,
    svc: CollabDep,
) -> MemberResponse:
    membership = await svc.accept_invitation(
        token=body.token,
        accepting_user_id=current_user.id,
        ip_address=request.client.host if request.client else None,
    )
    return MemberResponse.from_domain(membership)


@router.delete("/trees/{tree_id}/invitations/{invitation_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None, response_class=Response)
async def revoke_invitation(
    tree_id: uuid.UUID,
    invitation_id: uuid.UUID,
    current_user: CurrentUserDep,
    svc: CollabDep,
) -> None:
    await svc.revoke_invitation(
        invitation_id=invitation_id,
        tree_id=tree_id,
        actor_id=current_user.id,
        tenant_id=current_user.tenant_id,
        actor_name=current_user.display_name,
    )


# ── Audit log ──────────────────────────────────────────────────────────────────

@router.get("/trees/{tree_id}/audit-log", response_model=list[AuditEntryResponse])
async def get_audit_log(
    tree_id: uuid.UUID,
    current_user: CurrentUserDep,
    svc: CollabDep,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    entity_type: Optional[AuditEntityType] = Query(None),
    entity_id: Optional[uuid.UUID] = Query(None),
    actor_id: Optional[uuid.UUID] = Query(None),
) -> list[AuditEntryResponse]:
    entries = await svc.get_audit_log(
        tree_id=tree_id,
        actor_id=current_user.id,
        limit=limit,
        offset=offset,
        entity_type=entity_type,
        entity_id=entity_id,
        filter_actor_id=actor_id,
    )
    return [AuditEntryResponse.from_domain(e) for e in entries]


# ── Version history ────────────────────────────────────────────────────────────

@router.get(
    "/trees/{tree_id}/persons/{person_id}/versions",
    response_model=list[PersonVersionResponse],
)
async def list_person_versions(
    tree_id: uuid.UUID,
    person_id: uuid.UUID,
    current_user: CurrentUserDep,
    svc: CollabDep,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> list[PersonVersionResponse]:
    versions = await svc.get_person_history(
        person_id=person_id,
        tree_id=tree_id,
        actor_id=current_user.id,
        limit=limit,
        offset=offset,
    )
    return [PersonVersionResponse.from_domain(v) for v in versions]


@router.post(
    "/trees/{tree_id}/persons/{person_id}/versions/{version_number}/restore",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    response_class=Response,
)
async def restore_person_version(
    tree_id: uuid.UUID,
    person_id: uuid.UUID,
    version_number: int,
    request: Request,
    current_user: CurrentUserDep,
    svc: CollabDep,
) -> None:
    snapshot = await svc.restore_person_version(
        person_id=person_id,
        tree_id=tree_id,
        version_number=version_number,
        actor_id=current_user.id,
        actor_name=current_user.display_name,
        tenant_id=current_user.tenant_id,
        ip_address=request.client.host if request.client else None,
    )
    # TODO: apply snapshot to persons table via PersonRepository.update_from_snapshot(snapshot)
