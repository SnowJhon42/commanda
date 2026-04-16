from fastapi import HTTPException

from app.api.staff import patch_store_profile_settings
from app.core.security import verify_pin
from app.schemas.orders import UpdateStoreProfileRequest
from conftest import seed_minimum_store_data


def test_store_profile_can_rotate_owner_password(session_factory):
    session = session_factory()
    try:
        _, store, _, _, admin = seed_minimum_store_data(session)

        response = patch_store_profile_settings(
            payload=UpdateStoreProfileRequest(
                owner_password="1234",
                new_owner_password="4321",
                restaurant_name="Nuevo Nombre",
                logo_url=None,
                cover_image_url=None,
                theme_preset="CLASSIC",
                accent_color="ROJO",
                show_watermark_logo=False,
            ),
            store_id=store.id,
            db=session,
            current_staff=admin,
        )

        session.refresh(store)
        assert response.restaurant_name == "Nuevo Nombre"
        assert verify_pin("4321", store.owner_password_hash)
    finally:
        session.close()


def test_store_profile_rejects_wrong_owner_password(session_factory):
    session = session_factory()
    try:
        _, store, _, _, admin = seed_minimum_store_data(session)

        try:
            patch_store_profile_settings(
                payload=UpdateStoreProfileRequest(
                    owner_password="9999",
                    restaurant_name="No Cambia",
                    logo_url=None,
                    cover_image_url=None,
                    theme_preset="CLASSIC",
                    accent_color="ROJO",
                    show_watermark_logo=False,
                ),
                store_id=store.id,
                db=session,
                current_staff=admin,
            )
            assert False, "Expected HTTPException"
        except HTTPException as exc:
            assert exc.status_code == 403
    finally:
        session.close()
