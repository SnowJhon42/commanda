from app.services.table_code import normalize_table_code


def test_normalize_numeric_table_code():
    assert normalize_table_code("12") == "M12"
    assert normalize_table_code("0012") == "M12"


def test_normalize_existing_code():
    assert normalize_table_code("m12") == "M12"
    assert normalize_table_code(" M7 ") == "M7"
