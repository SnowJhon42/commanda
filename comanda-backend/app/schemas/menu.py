from urllib.parse import urlparse

from pydantic import BaseModel, field_validator


class CategoryOut(BaseModel):
    id: int
    name: str
    image_url: str | None = None
    sort_order: int


class VariantOut(BaseModel):
    id: int
    name: str
    extra_price: float


class ExtraOptionOut(BaseModel):
    id: int
    name: str
    extra_price: float
    active: bool


class ProductOut(BaseModel):
    id: int
    category_id: int | None = None
    name: str
    image_url: str | None = None
    description: str | None = None
    base_price: float
    fulfillment_sector: str
    variants: list[VariantOut]
    extra_options: list[ExtraOptionOut]
    active: bool


class MenuResponse(BaseModel):
    store_id: int
    show_live_total_to_client: bool = True
    categories: list[CategoryOut]
    products: list[ProductOut]


class ProductCreateIn(BaseModel):
    name: str
    base_price: float
    fulfillment_sector: str
    category_id: int | None = None
    description: str | None = None
    image_url: str | None = None
    active: bool = True

    @field_validator("base_price")
    def base_price_non_negative(cls, value: float) -> float:
        if value < 0:
            raise ValueError("base_price cannot be negative")
        return value


class ProductUpdateIn(BaseModel):
    name: str | None = None
    base_price: float | None = None
    fulfillment_sector: str | None = None
    category_id: int | None = None
    description: str | None = None
    image_url: str | None = None
    active: bool | None = None

    @field_validator("base_price")
    def base_price_non_negative(cls, value: float | None) -> float | None:
        if value is None:
            return value
        if value < 0:
            raise ValueError("base_price cannot be negative")
        return value


class ImageUrlPatchIn(BaseModel):
    image_url: str | None = None

    @field_validator("image_url")
    @classmethod
    def validate_image_url(cls, value: str | None) -> str | None:
        if value is None:
            return None
        candidate = value.strip()
        if not candidate:
            raise ValueError("image_url cannot be empty")
        if len(candidate) > 2048:
            raise ValueError("image_url is too long")
        parsed = urlparse(candidate)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("image_url must be a valid http(s) URL")
        return candidate


class ImageUrlPatchOut(BaseModel):
    id: int
    image_url: str | None = None


class ImageUploadOut(BaseModel):
    image_url: str


class ExtraOptionCreateIn(BaseModel):
    name: str
    extra_price: float = 0
    active: bool = True

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        candidate = value.strip()
        if not candidate:
            raise ValueError("name is required")
        return candidate

    @field_validator("extra_price")
    @classmethod
    def validate_extra_price(cls, value: float) -> float:
        if value < 0:
            raise ValueError("extra_price cannot be negative")
        return value


class ExtraOptionUpdateIn(BaseModel):
    name: str | None = None
    extra_price: float | None = None
    active: bool | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        candidate = value.strip()
        if not candidate:
            raise ValueError("name cannot be empty")
        return candidate

    @field_validator("extra_price")
    @classmethod
    def validate_extra_price(cls, value: float | None) -> float | None:
        if value is None:
            return value
        if value < 0:
            raise ValueError("extra_price cannot be negative")
        return value
