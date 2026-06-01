"""Persons + genealogy relationship router — /api/v1/trees/{tree_id}/persons/*"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query, Response, status

from src.api.deps import SessionDep, VerifiedUserDep
from src.application.genealogy.schemas import (
    AddChildRequest,
    AddParentRequest,
    AddSiblingRequest,
    AddSpouseRequest,
    AncestorsByGenerationResponse,
    CreatePersonRequest,
    KinshipResponse,
    LineagePathResponse,
    PersonDetailResponse,
    PersonResponse,
    UpdatePersonRequest,
)
from src.application.genealogy.service import FamilyTreeApplicationService

router = APIRouter(
    prefix="/trees/{tree_id}/persons",
    tags=["Persons & Relationships"],
)


def _svc(session: SessionDep) -> FamilyTreeApplicationService:
    return FamilyTreeApplicationService(session)


# ── Create person ─────────────────────────────────────────────────

@router.post(
    "",
    response_model=PersonResponse,
    status_code=201,
    summary="Add a new person to the tree",
)
async def create_person(
    tree_id: uuid.UUID,
    req: CreatePersonRequest,
    user: VerifiedUserDep,
    session: SessionDep,
) -> PersonResponse:
    from sqlalchemy import text as sa_text
    import uuid as _uuid
    person_id = _uuid.uuid4()
    await session.execute(
        sa_text("""
            INSERT INTO persons (id, tenant_id, tree_id, sex, display_given_name, display_surname, is_living)
            VALUES (:id, :tenant_id, :tree_id, :sex, :given, :surname, :living)
        """),
        {
            "id": person_id,
            "tenant_id": user.tenant_id,
            "tree_id": tree_id,
            "sex": req.sex.value,
            "given": req.given_name,
            "surname": req.surname,
            "living": req.is_living,
        },
    )
    await session.commit()
    return PersonResponse(
        id=person_id,
        tree_id=tree_id,
        display_given_name=req.given_name,
        display_surname=req.surname,
        sex=req.sex.value,
        is_living=req.is_living,
        is_deceased=False,
    )


# ── Person detail ─────────────────────────────────────────────────

@router.get(
    "/{person_id}",
    response_model=PersonDetailResponse,
    summary="Get a person with their immediate relatives",
)
async def get_person(
    tree_id: uuid.UUID,
    person_id: uuid.UUID,
    user: VerifiedUserDep,
    session: SessionDep,
) -> PersonDetailResponse:
    svc = _svc(session)
    return await svc.get_person(tree_id, user.tenant_id, person_id)


# ── Update person ────────────────────────────────────────────────

@router.patch(
    "/{person_id}",
    response_model=PersonResponse,
    summary="Update a person's details",
)
async def update_person(
    tree_id: uuid.UUID,
    person_id: uuid.UUID,
    req: UpdatePersonRequest,
    user: VerifiedUserDep,
    session: SessionDep,
) -> PersonResponse:
    from sqlalchemy import text as sa_text
    from fastapi import HTTPException

    result = await session.execute(
        sa_text("""
            UPDATE persons
            SET display_given_name = :given,
                display_surname    = :surname,
                sex                = :sex,
                is_living          = :living,
                is_deceased        = :deceased
            WHERE id = :pid AND tree_id = :tid AND tenant_id = :tenant AND is_deleted = false
            RETURNING id, tree_id, display_given_name, display_surname, sex, is_living, is_deceased
        """),
        {
            "given":   req.given_name,
            "surname": req.surname,
            "sex":     req.sex.value,
            "living":  req.is_living,
            "deceased": req.is_deceased,
            "pid":    person_id,
            "tid":    tree_id,
            "tenant": user.tenant_id,
        },
    )
    row = result.first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Person not found")
    await session.commit()
    return PersonResponse(
        id=row.id,
        tree_id=row.tree_id,
        display_given_name=row.display_given_name,
        display_surname=row.display_surname,
        sex=row.sex,
        is_living=row.is_living,
        is_deceased=row.is_deceased,
    )


# ── Delete person ────────────────────────────────────────────────

@router.delete(
    "/{person_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    response_class=Response,
    summary="Soft-delete a person from the tree",
)
async def delete_person(
    tree_id: uuid.UUID,
    person_id: uuid.UUID,
    user: VerifiedUserDep,
    session: SessionDep,
) -> None:
    from sqlalchemy import text as sa_text
    from datetime import datetime, timezone

    await session.execute(
        sa_text("""
            UPDATE persons
            SET is_deleted = true, deleted_at = :now
            WHERE id = :pid AND tree_id = :tid AND tenant_id = :tenant AND is_deleted = false
        """),
        {
            "pid": person_id,
            "tid": tree_id,
            "tenant": user.tenant_id,
            "now": datetime.now(timezone.utc),
        },
    )
    await session.commit()


# ── Add parent ────────────────────────────────────────────────────

@router.post(
    "/{person_id}/parents",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    response_class=Response,
    summary="Add a parent to a person",
)
async def add_parent(
    tree_id: uuid.UUID,
    person_id: uuid.UUID,
    req: AddParentRequest,
    user: VerifiedUserDep,
    session: SessionDep,
) -> None:
    svc = _svc(session)
    await svc.add_parent(tree_id, user.tenant_id, person_id, req)
    await session.commit()


# ── Add child ─────────────────────────────────────────────────────

@router.post(
    "/{person_id}/children",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    response_class=Response,
    summary="Add a child to a person",
)
async def add_child(
    tree_id: uuid.UUID,
    person_id: uuid.UUID,
    req: AddChildRequest,
    user: VerifiedUserDep,
    session: SessionDep,
    force: bool = Query(default=False, description="Remove existing parent group before linking"),
) -> None:
    from sqlalchemy import text as sa_text

    if force:
        # Remove the child's existing parent-family-group membership so the
        # validator in the domain service won't reject the operation.
        await session.execute(
            sa_text("""
                DELETE FROM family_group_members
                WHERE person_id = :pid
                  AND role = 'CHILD'
                  AND family_group_id IN (
                      SELECT id FROM family_groups WHERE tree_id = :tid
                  )
            """),
            {"pid": req.child_id, "tid": tree_id},
        )

    svc = _svc(session)
    await svc.add_child(tree_id, user.tenant_id, person_id, req)
    await session.commit()


# ── Add spouse ────────────────────────────────────────────────────

@router.post(
    "/{person_id}/spouses",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    response_class=Response,
    summary="Add a spouse / partner relationship",
)
async def add_spouse(
    tree_id: uuid.UUID,
    person_id: uuid.UUID,
    req: AddSpouseRequest,
    user: VerifiedUserDep,
    session: SessionDep,
) -> None:
    svc = _svc(session)
    await svc.add_spouse(tree_id, user.tenant_id, person_id, req)
    await session.commit()


# ── Add sibling ───────────────────────────────────────────────────

@router.post(
    "/{person_id}/siblings",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    response_class=Response,
    summary="Add a sibling relationship",
)
async def add_sibling(
    tree_id: uuid.UUID,
    person_id: uuid.UUID,
    req: AddSiblingRequest,
    user: VerifiedUserDep,
    session: SessionDep,
) -> None:
    svc = _svc(session)
    await svc.add_sibling(tree_id, user.tenant_id, person_id, req)
    await session.commit()


# ── Relationship queries ──────────────────────────────────────────

@router.get(
    "/{person_id}/ancestors",
    response_model=AncestorsByGenerationResponse,
    summary="Get all ancestors grouped by generation",
)
async def get_ancestors(
    tree_id: uuid.UUID,
    person_id: uuid.UUID,
    user: VerifiedUserDep,
    session: SessionDep,
    max_depth: int = Query(default=100, ge=1, le=100),
) -> AncestorsByGenerationResponse:
    svc = _svc(session)
    return await svc.get_ancestors(tree_id, user.tenant_id, person_id, max_depth)


@router.get(
    "/{person_id}/descendants",
    response_model=AncestorsByGenerationResponse,
    summary="Get all descendants grouped by generation",
)
async def get_descendants(
    tree_id: uuid.UUID,
    person_id: uuid.UUID,
    user: VerifiedUserDep,
    session: SessionDep,
    max_depth: int = Query(default=100, ge=1, le=100),
) -> AncestorsByGenerationResponse:
    svc = _svc(session)
    return await svc.get_descendants(tree_id, user.tenant_id, person_id, max_depth)


@router.get(
    "/{person_id}/kinship/{other_person_id}",
    response_model=KinshipResponse,
    summary="Calculate the relationship between two persons",
)
async def get_kinship(
    tree_id: uuid.UUID,
    person_id: uuid.UUID,
    other_person_id: uuid.UUID,
    user: VerifiedUserDep,
    session: SessionDep,
) -> KinshipResponse:
    svc = _svc(session)
    return await svc.get_kinship(tree_id, user.tenant_id, person_id, other_person_id)


@router.get(
    "/{person_id}/lineage-paths/{other_person_id}",
    response_model=list[LineagePathResponse],
    summary="Find all relationship paths between two persons",
)
async def get_lineage_paths(
    tree_id: uuid.UUID,
    person_id: uuid.UUID,
    other_person_id: uuid.UUID,
    user: VerifiedUserDep,
    session: SessionDep,
) -> list[LineagePathResponse]:
    svc = _svc(session)
    return await svc.get_lineage_paths(
        tree_id, user.tenant_id, person_id, other_person_id
    )
