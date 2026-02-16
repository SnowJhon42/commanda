from pydantic import BaseModel


class CategoryOut(BaseModel):
    id: int
    name: str
    sort_order: int


class VariantOut(BaseModel):
    id: int
    name: str
    extra_price: float


class ProductOut(BaseModel):
    id: int
    category_id: int | None = None
    name: str
    description: str | None = None
    base_price: float
    fulfillment_sector: str
    variants: list[VariantOut]


class MenuResponse(BaseModel):
    store_id: int
    categories: list[CategoryOut]
    products: list[ProductOut]
