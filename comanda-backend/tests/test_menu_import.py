from io import BytesIO
from zipfile import ZipFile

from app.services.menu_import import extract_menu_file_text


def test_extract_csv_menu_text_normalizes_delimiter():
    text, source_kind = extract_menu_file_text(
        "menu.csv",
        "categoria;producto;precio\nEntradas;Empanada;1200".encode("utf-8"),
    )

    assert source_kind == "csv"
    assert "categoria\tproducto\tprecio" in text
    assert "Entradas\tEmpanada\t1200" in text


def test_extract_docx_menu_text_reads_document_xml():
    buffer = BytesIO()
    with ZipFile(buffer, "w") as archive:
        archive.writestr(
            "word/document.xml",
            "<w:document><w:body><w:p><w:r><w:t>Milanesa</w:t></w:r></w:p></w:body></w:document>",
        )

    text, source_kind = extract_menu_file_text("carta.docx", buffer.getvalue())

    assert source_kind == "docx"
    assert "Milanesa" in text


def test_extract_xlsx_menu_text_reads_shared_strings():
    buffer = BytesIO()
    with ZipFile(buffer, "w") as archive:
        archive.writestr(
            "xl/sharedStrings.xml",
            """
            <sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
              <si><t>categoria</t></si>
              <si><t>producto</t></si>
              <si><t>Entradas</t></si>
              <si><t>Empanada</t></si>
            </sst>
            """,
        )
        archive.writestr(
            "xl/worksheets/sheet1.xml",
            """
            <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
              <sheetData>
                <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>
                <row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" t="s"><v>3</v></c></row>
              </sheetData>
            </worksheet>
            """,
        )

    text, source_kind = extract_menu_file_text("carta.xlsx", buffer.getvalue())

    assert source_kind == "xlsx"
    assert "categoria\tproducto" in text
    assert "Entradas\tEmpanada" in text
