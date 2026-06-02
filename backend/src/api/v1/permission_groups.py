"""Admin — Permission Group management.

Permission groups are reusable access templates that admins assign to
users for specific trees. Three levels are supported:
  VISIBLE    — user can see the tree exists but not its content
  READ       — read-only access (maps to TreeRole.VIEWER)
  READ_WRITE — full edit access (maps to TreeRole.EDITOR)
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select, text

from src.api.deps import AdminUserDep, SessionDep
from src.infrastructure.database.models.permission_group import (
    PermissionGroupAssignmentModel,
    PermissionGroupModel,
)
from src.infrastructure.database.models.user import UserModel

router = APIRouter(prefix="/admin", tags=["Admin", "Permission Groups"])

VALID_LEVELS = {"VISIBLE", "READ", "READ_WRITE"}

# ── Role mapping ────────────────────────────────────────────────────────────────
# When a READ/READ_WRITE assignment is created we also upsert a TreeMemberModel
# so the existing access-control system is respected.

_LEVEL_TO_TREE_ROLE = {
    "READ":       "VIEWER",
    "READ_WRITE": "EDITOR",
}

# ── Schemas ─────────────────────────────────────────────────────────────────────

class PermissionGroupCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    permission_level: str = Field(..., pattern="^(VISIBLE|READ|READ_WRITE)$")


class PermissionGroupUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    permission_level: Optional[str] = Field(None, pattern="^(VISIBLE|READ|READ_WRITE)$")


class PermissionGroupResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str]
    permission_level: str
    assignment_count: int
    created_by: Optional[uuid.UUID]
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}


class AssignmentCreate(BaseModel):
    user_id: uuid.UUID
    tree_id: uuid.UUID


class AssignmentResponse(BaseModel):
    id: uuid.UUID
    group_id: uuid.UUID
    user_id: uuid.UUID
    user_email: str
    user_display_name: str
    tree_id: uuid.UUID
    tree_name: str
    permission_level: str
    assigned_by: Optional[uuid.UUID]
    assigned_at: str

    model_config = {"from_attributes": True}


class TenantTreeResponse(BaseModel):
    id: uuid.UUID
    name: str

    model_config = {"from_attributes": True}


# ── Helpers ─────────────────────────────────────────────────────────────────────

def _serialize_group(g: PermissionGroupModel, count: int) -> PermissionGroupResponse:
    return PermissionGroupResponse(
        id=g.id,
        name=g.name,
        description=g.description,
        permission_level=g.permission_level,
        assignment_count=count,
        created_by=g.created_by,
        created_at=g.created_at.isoformat(),
        updated_at=g.updated_at.isoformat(),
    )


async def _upsert_tree_member(
    session,
    tree_id: uuid.UUID,
    user_id: uuid.UUID,
    tenant_id: uuid.UUID,
    role: str,
    invited_by: uuid.UUID,
) -> None:
    """Create or update a TreeMemberModel row for READ / READ_WRITE assignments."""
    existing = (await session.execute(
        text("""
            SELECT id FROM tree_members
            WHERE tree_id = :tree_id AND user_id = :user_id
        """),
        {"tree_id": tree_id, "user_id": user_id},
    )).first()

    if existing:
        await session.execute(
            text("UPDATE tree_members SET role = :role WHERE tree_id = :tree_id AND user_id = :user_id"),
            {"role": role, "tree_id": tree_id, "user_id": user_id},
        )
    else:
        await session.execute(
            text("""
                INSERT INTO tree_members (tree_id, user_id, tenant_id, role, invited_by_id, joined_at)
                VALUES (:tree_id, :user_id, :tenant_id, :role, :invited_by, now())
                ON CONFLICT (tree_id, user_id) DO UPDATE SET role = EXCLUDED.role
            """),
            {
                "tree_id": tree_id,
                "user_id": user_id,
                "tenant_id": tenant_id,
                "role": role,
                "invited_by": invited_by,
            },
        )


async def _remove_tree_member(session, tree_id: uuid.UUID, user_id: uuid.UUID) -> None:
    """Remove a tree member row created via permission group assignment."""
    await session.execute(
        text("DELETE FROM tree_members WHERE tree_id = :tree_id AND user_id = :user_id"),
        {"tree_id": tree_id, "user_id": user_id},
    )


# ── Endpoints — Groups ──────────────────────────────────────────────────────────

@router.get("/permission-groups", response_model=list[PermissionGroupResponse],
            summary="List all permission groups in the tenant")
async def list_permission_groups(
    current_user: AdminUserDep,
    session: SessionDep,
) -> list[PermissionGroupResponse]:
    rows = (await session.execute(
        select(
            PermissionGroupModel,
            func.count(PermissionGroupAssignmentModel.id).label("cnt"),
        )
        .outerjoin(
            PermissionGroupAssignmentModel,
            PermissionGroupAssignmentModel.group_id == PermissionGroupModel.id,
        )
        .where(PermissionGroupModel.tenant_id == current_user.tenant_id)
        .group_by(PermissionGroupModel.id)
        .order_by(PermissionGroupModel.name)
    )).all()

    return [_serialize_group(row.PermissionGroupModel, row.cnt) for row in rows]


@router.post("/permission-groups", response_model=PermissionGroupResponse,
             status_code=status.HTTP_201_CREATED,
             summary="Create a permission group")
async def create_permission_group(
    body: PermissionGroupCreate,
    current_user: AdminUserDep,
    session: SessionDep,
) -> PermissionGroupResponse:
    existing = (await session.execute(
        select(PermissionGroupModel).where(
            PermissionGroupModel.tenant_id == current_user.tenant_id,
            PermissionGroupModel.name == body.name,
        )
    )).scalars().first()
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT,
                            f"A permission group named '{body.name}' already exists")

    group = PermissionGroupModel(
        tenant_id=current_user.tenant_id,
        name=body.name,
        description=body.description,
        permission_level=body.permission_level,
        created_by=current_user.id,
    )
    session.add(group)
    await session.commit()
    await session.refresh(group)
    return _serialize_group(group, 0)


@router.patch("/permission-groups/{group_id}", response_model=PermissionGroupResponse,
              summary="Update a permission group")
async def update_permission_group(
    group_id: uuid.UUID,
    body: PermissionGroupUpdate,
    current_user: AdminUserDep,
    session: SessionDep,
) -> PermissionGroupResponse:
    group = (await session.execute(
        select(PermissionGroupModel).where(
            PermissionGroupModel.id == group_id,
            PermissionGroupModel.tenant_id == current_user.tenant_id,
        )
    )).scalars().first()
    if group is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Permission group not found")

    if body.name is not None:
        group.name = body.name
    if body.description is not None:
        group.description = body.description
    if body.permission_level is not None:
        group.permission_level = body.permission_level

    await session.commit()
    await session.refresh(group)

    count = (await session.execute(
        select(func.count()).where(PermissionGroupAssignmentModel.group_id == group_id)
    )).scalar_one()
    return _serialize_group(group, count)


@router.delete("/permission-groups/{group_id}",
               status_code=status.HTTP_204_NO_CONTENT,
               response_model=None,
               summary="Delete a permission group and all its assignments")
async def delete_permission_group(
    group_id: uuid.UUID,
    current_user: AdminUserDep,
    session: SessionDep,
) -> None:
    group = (await session.execute(
        select(PermissionGroupModel).where(
            PermissionGroupModel.id == group_id,
            PermissionGroupModel.tenant_id == current_user.tenant_id,
        )
    )).scalars().first()
    if group is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Permission group not found")

    await session.delete(group)
    await session.commit()


# ── Endpoints — Assignments ─────────────────────────────────────────────────────

@router.get("/permission-groups/{group_id}/assignments",
            response_model=list[AssignmentResponse],
            summary="List all user assignments for a permission group")
async def list_assignments(
    group_id: uuid.UUID,
    current_user: AdminUserDep,
    session: SessionDep,
) -> list[AssignmentResponse]:
    group = (await session.execute(
        select(PermissionGroupModel).where(
            PermissionGroupModel.id == group_id,
            PermissionGroupModel.tenant_id == current_user.tenant_id,
        )
    )).scalars().first()
    if group is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Permission group not found")

    rows = (await session.execute(
        text("""
            SELECT
                pga.id,
                pga.group_id,
                pga.user_id,
                u.email            AS user_email,
                COALESCE(NULLIF(TRIM(CONCAT(u.given_name, ' ', u.family_name)), ''), u.email)
                                   AS user_display_name,
                pga.tree_id,
                ft.name            AS tree_name,
                pg.permission_level,
                pga.assigned_by,
                pga.assigned_at
            FROM permission_group_assignments pga
            JOIN users u            ON u.id = pga.user_id
            JOIN family_trees ft    ON ft.id = pga.tree_id
            JOIN permission_groups pg ON pg.id = pga.group_id
            WHERE pga.group_id = :group_id
            ORDER BY pga.assigned_at DESC
        """),
        {"group_id": group_id},
    )).fetchall()

    return [
        AssignmentResponse(
            id=r.id,
            group_id=r.group_id,
            user_id=r.user_id,
            user_email=r.user_email,
            user_display_name=r.user_display_name,
            tree_id=r.tree_id,
            tree_name=r.tree_name,
            permission_level=r.permission_level,
            assigned_by=r.assigned_by,
            assigned_at=r.assigned_at.isoformat(),
        )
        for r in rows
    ]


@router.post("/permission-groups/{group_id}/assignments",
             response_model=AssignmentResponse,
             status_code=status.HTTP_201_CREATED,
             summary="Assign a user to a permission group for a specific tree")
async def create_assignment(
    group_id: uuid.UUID,
    body: AssignmentCreate,
    current_user: AdminUserDep,
    session: SessionDep,
) -> AssignmentResponse:
    group = (await session.execute(
        select(PermissionGroupModel).where(
            PermissionGroupModel.id == group_id,
            PermissionGroupModel.tenant_id == current_user.tenant_id,
        )
    )).scalars().first()
    if group is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Permission group not found")

    # Verify user is in same tenant
    user = (await session.execute(
        select(UserModel).where(
            UserModel.id == body.user_id,
            UserModel.tenant_id == current_user.tenant_id,
        )
    )).scalars().first()
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found in this tenant")

    # Verify tree exists in tenant
    tree_row = (await session.execute(
        text("SELECT id, name FROM family_trees WHERE id = :id AND tenant_id = :tid"),
        {"id": body.tree_id, "tid": current_user.tenant_id},
    )).first()
    if tree_row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tree not found in this tenant")

    # Check duplicate
    dup = (await session.execute(
        select(PermissionGroupAssignmentModel).where(
            PermissionGroupAssignmentModel.group_id == group_id,
            PermissionGroupAssignmentModel.user_id == body.user_id,
            PermissionGroupAssignmentModel.tree_id == body.tree_id,
        )
    )).scalars().first()
    if dup:
        raise HTTPException(status.HTTP_409_CONFLICT,
                            "This user is already assigned to this group for that tree")

    assignment = PermissionGroupAssignmentModel(
        group_id=group_id,
        user_id=body.user_id,
        tree_id=body.tree_id,
        assigned_by=current_user.id,
    )
    session.add(assignment)

    # Grant actual tree access for READ and READ_WRITE
    tree_role = _LEVEL_TO_TREE_ROLE.get(group.permission_level)
    if tree_role:
        await _upsert_tree_member(
            session,
            tree_id=body.tree_id,
            user_id=body.user_id,
            tenant_id=current_user.tenant_id,
            role=tree_role,
            invited_by=current_user.id,
        )

    await session.commit()
    await session.refresh(assignment)

    user_display = f"{user.given_name or ''} {user.family_name or ''}".strip() or user.email

    return AssignmentResponse(
        id=assignment.id,
        group_id=assignment.group_id,
        user_id=assignment.user_id,
        user_email=user.email,
        user_display_name=user_display,
        tree_id=assignment.tree_id,
        tree_name=tree_row.name,
        permission_level=group.permission_level,
        assigned_by=assignment.assigned_by,
        assigned_at=assignment.assigned_at.isoformat(),
    )


@router.delete("/permission-groups/{group_id}/assignments/{assignment_id}",
               status_code=status.HTTP_204_NO_CONTENT,
               response_model=None,
               summary="Remove a user assignment from a permission group")
async def delete_assignment(
    group_id: uuid.UUID,
    assignment_id: uuid.UUID,
    current_user: AdminUserDep,
    session: SessionDep,
) -> None:
    group = (await session.execute(
        select(PermissionGroupModel).where(
            PermissionGroupModel.id == group_id,
            PermissionGroupModel.tenant_id == current_user.tenant_id,
        )
    )).scalars().first()
    if group is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Permission group not found")

    assignment = (await session.execute(
        select(PermissionGroupAssignmentModel).where(
            PermissionGroupAssignmentModel.id == assignment_id,
            PermissionGroupAssignmentModel.group_id == group_id,
        )
    )).scalars().first()
    if assignment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Assignment not found")

    user_id = assignment.user_id
    tree_id = assignment.tree_id

    await session.delete(assignment)

    # Remove tree membership if it was granted via this group
    if group.permission_level in _LEVEL_TO_TREE_ROLE:
        await _remove_tree_member(session, tree_id, user_id)

    await session.commit()


# ── Helper endpoint — list trees in tenant (for assignment modal) ──────────────

@router.get("/trees", response_model=list[TenantTreeResponse],
            summary="List all trees in the tenant (for assignment dropdowns)")
async def list_tenant_trees(
    current_user: AdminUserDep,
    session: SessionDep,
) -> list[TenantTreeResponse]:
    rows = (await session.execute(
        text("""
            SELECT id, name FROM family_trees
            WHERE tenant_id = :tid AND is_deleted = false
            ORDER BY name
        """),
        {"tid": current_user.tenant_id},
    )).fetchall()
    return [TenantTreeResponse(id=r.id, name=r.name) for r in rows]
