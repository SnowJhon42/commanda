from app.db.models import Product


def route_item_to_sector(product: Product) -> str:
    return product.fulfillment_sector
