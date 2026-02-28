import pytest
from pydantic import ValidationError

from app.schemas.menu import ImageUrlPatchIn


def test_image_url_patch_accepts_https_url():
    payload = ImageUrlPatchIn(image_url="https://cdn.example.com/menu/products/gin-tonic.jpg")
    assert payload.image_url == "https://cdn.example.com/menu/products/gin-tonic.jpg"


def test_image_url_patch_accepts_null():
    payload = ImageUrlPatchIn(image_url=None)
    assert payload.image_url is None


def test_image_url_patch_rejects_non_http_scheme():
    with pytest.raises(ValidationError):
        ImageUrlPatchIn(image_url="ftp://cdn.example.com/menu/products/gin-tonic.jpg")


def test_image_url_patch_rejects_empty_string():
    with pytest.raises(ValidationError):
        ImageUrlPatchIn(image_url="   ")
