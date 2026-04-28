from urllib.parse import urlparse

from pydantic import BaseModel, Field, field_validator


class CategoryOut(BaseModel):
    id: int
    name: str
    image_url: str | None = None
    sort_order: int


class CategoryCreateIn(BaseModel):
    name: str
    sort_order: int | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        candidate = value.strip()
        if not candidate:
            raise ValueError("name is required")
        if len(candidate) > 100:
            raise ValueError("name is too long")
        return candidate


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
    archived: bool = False


class MenuResponse(BaseModel):
    tenant_id: int
    store_id: int
    store_name: str
    show_live_total_to_client: bool = True
    whatsapp_share_template: str | None = None
    logo_url: str | None = None
    cover_image_url: str | None = None
    theme_preset: str = "CLASSIC"
    accent_color: str = "ROJO"
    background_color: str = "ROJO"
    background_image_url: str | None = None
    show_watermark_logo: bool = False
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


class MenuImportDraftItem(BaseModel):
    row_id: str
    category_name: str | None = None
    name: str
    description: str | None = None
    base_price: float | None = None
    fulfillment_sector: str = "KITCHEN"
    image_url: str | None = None
    active: bool = True
    confidence: float = 0.0
    warnings: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)

    @field_validator("fulfillment_sector")
    @classmethod
    def validate_fulfillment_sector(cls, value: str) -> str:
        sector = value.strip().upper()
        if sector not in {"KITCHEN", "BAR", "WAITER"}:
            return "KITCHEN"
        return sector


class MenuImportPreviewOut(BaseModel):
    source_filename: str
    source_kind: str
    items: list[MenuImportDraftItem]
    warnings: list[str] = Field(default_factory=list)


class MenuImportCommitIn(BaseModel):
    items: list[MenuImportDraftItem]


class MenuImportCommitOut(BaseModel):
    created_categories: int
    created_products: int
    skipped_items: int


class ProductDeleteOut(BaseModel):
    product_id: int
    deleted: bool
    archived: bool
    had_history: bool


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
