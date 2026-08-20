# v-b.tech Print Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved Paper Signal PDF design guide, reusable DOTX source, editable DOCX business templates, and visually verified reference PDFs.

**Architecture:** A small Python package owns one print-token model, one field vocabulary, OOXML helpers, Word builders, a ReportLab brandbook builder, and release audits. The generated DOTX is the operational Word style source; every DOCX is instantiated from it, while PDF and PNG renders are treated as verification outputs rather than alternate sources.

**Tech Stack:** Bundled Python 3, `python-docx`, `lxml`, `reportlab`, `pypdf`, `pdfplumber`, Pillow, standard-library `unittest`, LibreOffice via the bundled document renderer, and Poppler `pdftoppm`.

**Spec:** `docs/superpowers/specs/2026-08-20-vbtech-print-design-system.md`

## Global Constraints

- Use the approved Paper Signal direction and compact A4 proportions; ordinary contract content begins at approximately 27 percent of first-page height.
- Use IBM Plex Sans for reading text and IBM Plex Mono for labels, identifiers, numbers, and metadata.
- Vendor only the required IBM Plex TTF files and the OFL-1.1 license from the official IBM/plex repository; builds must not make web-font requests.
- Use `VBT-LTR-01`, `VBT-AGR-01`, `VBT-SOW-01`, `VBT-INV-01`, `VBT-ACT-01`, and `VBT-FRM-01` exactly.
- Treat `DOCUMENT_NUMBER` as a three-character externally supplied field with example `001`; do not implement allocation, sequencing, uniqueness, reset, or validation beyond display width.
- Support `SOLE_PROPRIETOR` and `INDIVIDUAL` issuer modes without manual page reconstruction.
- Include no approved legal wording, real personal data, tax data, banking data, customer data, or accounting advice.
- Use real Word styles, real numbering definitions, explicit table geometry, named content controls, repeating table headers, and computed `N из M` fields.
- Render and inspect every final DOCX and PDF page; do not deliver QA PNGs or scratch files.
- Do not claim certified legal, accounting, physical-printer, or prepress acceptance.
- Use `/Users/thevladbog/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3` for Python work and `/Users/thevladbog/.codex/plugins/cache/openai-primary-runtime/documents/26.819.11345/skills/documents/render_docx.py` for DOCX rendering.

## Planned File Map

```text
print-system/
  README.md                         Operator workflow and acceptance boundary
  pyproject.toml                    Package metadata only; no runtime download step
  assets/
    fonts/                          Vendored IBM Plex TTFs, OFL.txt, SHA256SUMS
    logos/vb-wordmark-print.svg     Print-safe vector wordmark
  content/brandbook.ru.json         Brandbook copy and ordered page manifest
  src/vb_print/
    model.py                        Template codes, field vocabulary, issuer modes
    tokens.py                       Exact A4, colour, typography, spacing tokens
    build.py                        Single CLI for templates, brandbook, and release
    inspect.py                      OOXML/PDF structural inspection
    word/
      package.py                    DOCX/DOTX package conversion and field primitives
      styles.py                     Page, style, numbering, header/footer setup
      components.py                 Shared metadata, party, table, total, signature blocks
      master.py                     Master DOTX builder
      templates.py                  Letterhead, form, contract, SOW, invoice, act builders
      issuer.py                     Issuer-mode materialisation
    pdf/
      fonts.py                      ReportLab font registration
      components.py                 Paper Signal PDF components
      brandbook.py                  Explicit-page brandbook builder
  tests/                            Unit and structural contract tests
  templates/                        Versioned DOTX and DOCX source artefacts
output/pdf/                          Final brandbook and reference PDFs
tmp/documents/                       DOCX render intermediates
tmp/pdfs/                            PDF render intermediates
```

---

### Task 1: Reproducible print assets and exact system model

**Files:**
- Modify: `.gitignore`
- Create: `print-system/pyproject.toml`
- Create: `print-system/assets/fonts/OFL.txt`
- Create: `print-system/assets/fonts/SHA256SUMS`
- Create: `print-system/assets/fonts/IBMPlexSans-Regular.ttf`
- Create: `print-system/assets/fonts/IBMPlexSans-Medium.ttf`
- Create: `print-system/assets/fonts/IBMPlexSans-SemiBold.ttf`
- Create: `print-system/assets/fonts/IBMPlexSans-Bold.ttf`
- Create: `print-system/assets/fonts/IBMPlexMono-Medium.ttf`
- Create: `print-system/assets/fonts/IBMPlexMono-SemiBold.ttf`
- Create: `print-system/assets/logos/vb-wordmark-print.svg`
- Create: `print-system/src/vb_print/__init__.py`
- Create: `print-system/src/vb_print/model.py`
- Create: `print-system/src/vb_print/tokens.py`
- Test: `print-system/tests/test_model.py`

**Interfaces:**
- Consumes: `brand/tokens.css`, `brand/logos/vb-mark-tile.svg`, the approved spec.
- Produces: `IssuerMode`, `TEMPLATE_CODES`, `FIELD_NAMES`, `PLACEHOLDER_VALUES`, `PrintTokens`, and vendored print assets used by every later task.

- [ ] **Step 1: Write the failing model contract test**

```python
import unittest
from vb_print.model import FIELD_NAMES, PLACEHOLDER_VALUES, TEMPLATE_CODES, IssuerMode
from vb_print.tokens import PRINT_TOKENS


class ModelContractTest(unittest.TestCase):
    def test_codes_fields_and_compact_page_tokens_are_exact(self):
        self.assertEqual(TEMPLATE_CODES["contract"], "VBT-AGR-01")
        self.assertEqual(TEMPLATE_CODES["invoice"], "VBT-INV-01")
        self.assertIn("DOCUMENT_NUMBER", FIELD_NAMES)
        self.assertEqual(PLACEHOLDER_VALUES["DOCUMENT_NUMBER"], "001")
        self.assertEqual(set(IssuerMode), {IssuerMode.SOLE_PROPRIETOR, IssuerMode.INDIVIDUAL})
        self.assertEqual(PRINT_TOKENS.page.size, "A4")
        self.assertEqual(PRINT_TOKENS.colour.signal_amber, "F5A623")
        self.assertLessEqual(PRINT_TOKENS.first_page.content_start_ratio, 0.27)
```

- [ ] **Step 2: Run the test and confirm the package is absent**

Run:

```bash
PYTHONPATH=print-system/src /Users/thevladbog/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 -m unittest print-system/tests/test_model.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'vb_print'`.

- [ ] **Step 3: Vendor official IBM Plex assets at pinned source commits**

Download the six named TTF files from these immutable official commit roots:

```text
https://raw.githubusercontent.com/IBM/plex/1da12f0/packages/plex-sans/fonts/complete/ttf/
https://raw.githubusercontent.com/IBM/plex/2f9ba1b/packages/plex-mono/fonts/complete/ttf/
```

Download `LICENSE.txt` from `https://raw.githubusercontent.com/IBM/plex/2f9ba1b/LICENSE.txt` as `print-system/assets/fonts/OFL.txt`. Compute `shasum -a 256` over the six TTFs and `OFL.txt`, sort by filename, and save the seven-line result as `SHA256SUMS`. Builds use these committed assets and perform no font downloads.

Run these exact acquisition commands after network approval:

```bash
mkdir -p print-system/assets/fonts
curl -fL https://raw.githubusercontent.com/IBM/plex/1da12f0/packages/plex-sans/fonts/complete/ttf/IBMPlexSans-Regular.ttf -o print-system/assets/fonts/IBMPlexSans-Regular.ttf
curl -fL https://raw.githubusercontent.com/IBM/plex/1da12f0/packages/plex-sans/fonts/complete/ttf/IBMPlexSans-Medium.ttf -o print-system/assets/fonts/IBMPlexSans-Medium.ttf
curl -fL https://raw.githubusercontent.com/IBM/plex/1da12f0/packages/plex-sans/fonts/complete/ttf/IBMPlexSans-SemiBold.ttf -o print-system/assets/fonts/IBMPlexSans-SemiBold.ttf
curl -fL https://raw.githubusercontent.com/IBM/plex/1da12f0/packages/plex-sans/fonts/complete/ttf/IBMPlexSans-Bold.ttf -o print-system/assets/fonts/IBMPlexSans-Bold.ttf
curl -fL https://raw.githubusercontent.com/IBM/plex/2f9ba1b/packages/plex-mono/fonts/complete/ttf/IBMPlexMono-Medium.ttf -o print-system/assets/fonts/IBMPlexMono-Medium.ttf
curl -fL https://raw.githubusercontent.com/IBM/plex/2f9ba1b/packages/plex-mono/fonts/complete/ttf/IBMPlexMono-SemiBold.ttf -o print-system/assets/fonts/IBMPlexMono-SemiBold.ttf
curl -fL https://raw.githubusercontent.com/IBM/plex/2f9ba1b/LICENSE.txt -o print-system/assets/fonts/OFL.txt
```

Then generate and verify the lock file:

```bash
shasum -a 256 print-system/assets/fonts/IBMPlexSans-Regular.ttf print-system/assets/fonts/IBMPlexSans-Medium.ttf print-system/assets/fonts/IBMPlexSans-SemiBold.ttf print-system/assets/fonts/IBMPlexSans-Bold.ttf print-system/assets/fonts/IBMPlexMono-Medium.ttf print-system/assets/fonts/IBMPlexMono-SemiBold.ttf print-system/assets/fonts/OFL.txt | sort -k 2 > print-system/assets/fonts/SHA256SUMS
test "$(wc -l < print-system/assets/fonts/SHA256SUMS)" -eq 7
```

Expected: every `curl` exits 0 and the final check exits 0.

- [ ] **Step 4: Implement the exact model and token dataclasses**

```python
from dataclasses import dataclass
from enum import StrEnum


class IssuerMode(StrEnum):
    SOLE_PROPRIETOR = "SOLE_PROPRIETOR"
    INDIVIDUAL = "INDIVIDUAL"


TEMPLATE_CODES = {
    "letterhead": "VBT-LTR-01",
    "contract": "VBT-AGR-01",
    "specification": "VBT-SOW-01",
    "invoice": "VBT-INV-01",
    "act": "VBT-ACT-01",
    "form": "VBT-FRM-01",
}

FIELD_NAMES = frozenset({
    "ISSUER_MODE", "DOCUMENT_NUMBER", "DOCUMENT_DATE", "DOCUMENT_PLACE",
    "DOCUMENT_STATUS", "TEMPLATE_REVISION", "ISSUER_NAME", "ISSUER_INN",
    "ISSUER_OGRNIP", "ISSUER_ADDRESS", "ISSUER_BANK_NAME", "ISSUER_BIK",
    "ISSUER_ACCOUNT", "ISSUER_CORR_ACCOUNT", "ISSUER_CONTACT", "CUSTOMER_NAME",
    "CUSTOMER_REPRESENTATIVE", "CUSTOMER_AUTHORITY", "CUSTOMER_INN",
    "CUSTOMER_ADDRESS", "CUSTOMER_BANK_NAME", "CUSTOMER_BIK", "CUSTOMER_ACCOUNT",
    "CUSTOMER_CORR_ACCOUNT", "CONTRACT_BASIS", "SERVICE_PERIOD", "CURRENCY",
    "LINE_ITEMS", "SUBTOTAL", "TAX_TREATMENT", "TOTAL", "AMOUNT_IN_WORDS",
})

PLACEHOLDER_VALUES = {
    "DOCUMENT_NUMBER": "001",
    "DOCUMENT_DATE": "ДД.ММ.ГГГГ",
    "ISSUER_NAME": "[ФИО ИСПОЛНИТЕЛЯ]",
    "CUSTOMER_NAME": "[НАИМЕНОВАНИЕ ЗАКАЗЧИКА]",
}
```

Define frozen token dataclasses for A4 `210 x 297 mm`, 18 mm side margins, 16 mm top and bottom margins, Paper `F5F5F2`, Ink `111315`, Signal Amber `F5A623`, grayscale fallbacks, and the approved `0.27` content-start ratio. Use these exact type roles: title Sans Bold `18/20 pt`; heading 1 Sans SemiBold `12/15 pt`; heading 2 Sans SemiBold `10.5/13 pt`; body Sans Regular `9.5/13.5 pt`; label Mono Medium `7.5/9.5 pt`; metadata Mono Medium `7/9 pt`; footer Mono Medium `7/9 pt`. Use a 4 mm base spacing unit, 0.5 pt hairlines, and a 2.25 pt signal rule.

Create `pyproject.toml` with package name `vb-print-system`, Python floor `>=3.11`, `src` package discovery, and no install-time dependencies because the bundled runtime is authoritative. Add these exact `.gitignore` entries:

```gitignore
.superpowers/
.turbo/
tmp/documents/*
!tmp/documents/.gitkeep
tmp/pdfs/*
!tmp/pdfs/.gitkeep
```

- [ ] **Step 5: Create the outlined print wordmark SVG**

Build a vector wordmark with the v-b.tech text converted to paths and the signal dash as a separate `#F5A623` rounded path. Include a `viewBox`, no external font reference, no raster image, and a monochrome-compatible `data-role="signal-dash"` element.

- [ ] **Step 6: Run the focused model test**

Run the Step 2 command.

Expected: PASS.

- [ ] **Step 7: Commit the foundation**

```bash
git add .gitignore print-system/pyproject.toml print-system/assets print-system/src/vb_print/__init__.py print-system/src/vb_print/model.py print-system/src/vb_print/tokens.py print-system/tests/test_model.py
git commit -m "feat(print): define Paper Signal assets and tokens"
```

### Task 2: OOXML package, field, and inspection primitives

**Files:**
- Create: `print-system/src/vb_print/word/__init__.py`
- Create: `print-system/src/vb_print/word/package.py`
- Create: `print-system/src/vb_print/inspect.py`
- Test: `print-system/tests/test_word_package.py`

**Interfaces:**
- Consumes: `FIELD_NAMES`, `PLACEHOLDER_VALUES`, `IssuerMode`.
- Produces: `write_dotx(document, path)`, `instantiate_dotx(dotx_path, docx_path)`, `add_text_control(paragraph, tag, text)`, `add_page_field(paragraph, field_code)`, `inspect_word_package(path) -> WordInspection`, and `embedded_pdf_fonts(path) -> tuple[str, ...]`.

- [ ] **Step 1: Write failing OOXML contract tests**

```python
import tempfile
import unittest
from pathlib import Path
from docx import Document
from vb_print.inspect import inspect_word_package
from vb_print.word.package import add_text_control, instantiate_dotx, write_dotx


class WordPackageTest(unittest.TestCase):
    def test_dotx_kind_and_named_control_survive_instantiation(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            document = Document()
            add_text_control(document.add_paragraph(), "DOCUMENT_NUMBER", "001")
            dotx = tmp_path / "master.dotx"
            docx = tmp_path / "instance.docx"
            write_dotx(document, dotx)
            instantiate_dotx(dotx, docx)

            master = inspect_word_package(dotx)
            instance = inspect_word_package(docx)
            self.assertEqual(master.package_kind, "dotx")
            self.assertEqual(instance.package_kind, "docx")
            self.assertIn("DOCUMENT_NUMBER", instance.content_control_tags)
```

- [ ] **Step 2: Run the focused test and verify missing imports**

Run:

```bash
PYTHONPATH=print-system/src /Users/thevladbog/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 -m unittest print-system/tests/test_word_package.py -v
```

Expected: FAIL because `vb_print.word.package` and `vb_print.inspect` do not exist.

- [ ] **Step 3: Implement package-kind conversion and named controls**

```python
DOCX_MAIN = "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"
DOTX_MAIN = "application/vnd.openxmlformats-officedocument.wordprocessingml.template.main+xml"


def write_dotx(document: Document, path: Path) -> None:
    with TemporaryDirectory() as tmp:
        docx_path = Path(tmp) / "master.docx"
        document.save(docx_path)
        _rewrite_main_content_type(docx_path, path, DOCX_MAIN, DOTX_MAIN)


def instantiate_dotx(dotx_path: Path, docx_path: Path) -> None:
    _rewrite_main_content_type(dotx_path, docx_path, DOTX_MAIN, DOCX_MAIN)


def add_text_control(paragraph, tag: str, text: str):
    if tag not in FIELD_NAMES:
        raise ValueError(f"Unknown field tag: {tag}")
    return _append_sdt_run(paragraph, tag=tag, alias=tag, text=text)
```

Use `zipfile` and `lxml` to rewrite only `[Content_Types].xml`. Preserve every other ZIP member byte-for-byte. Build `w:sdt` controls with matching `w:tag` and `w:alias` values.

- [ ] **Step 4: Implement structural inspection**

`WordInspection` is a frozen dataclass with `package_kind`, `content_control_tags`, `style_ids`, `numbering_definition_count`, `header_count`, `footer_count`, `field_codes`, `visible_text`, `has_keep_together_signature_block`, `tables_have_explicit_geometry`, and `tables_have_repeating_headers`. Parse `word/document.xml`, styles, numbering, headers, and footers directly from the package. `embedded_pdf_fonts(path)` reads every page resource dictionary through `pypdf`, follows indirect objects, and returns sorted unique `/BaseFont` names.

- [ ] **Step 5: Run the focused test**

Run the Step 2 command.

Expected: PASS.

- [ ] **Step 6: Commit OOXML primitives**

```bash
git add print-system/src/vb_print/word print-system/src/vb_print/inspect.py print-system/tests/test_word_package.py
git commit -m "feat(print): add Word package and field primitives"
```

### Task 3: Paper Signal master DOTX

**Files:**
- Create: `print-system/src/vb_print/word/styles.py`
- Create: `print-system/src/vb_print/word/components.py`
- Create: `print-system/src/vb_print/word/master.py`
- Create: `print-system/templates/v-b-paper-signal.dotx`
- Test: `print-system/tests/test_master_template.py`

**Interfaces:**
- Consumes: `PRINT_TOKENS`, the print wordmark, `write_dotx`, `add_page_field`.
- Produces: `build_master_template(output_path: Path) -> Path`, shared style IDs, numbering IDs, metadata/header/footer builders, and the versioned DOTX.

- [ ] **Step 1: Write the failing master-template contract**

```python
import tempfile
import unittest
from pathlib import Path
from vb_print.inspect import inspect_word_package
from vb_print.word.master import build_master_template


class MasterTemplateTest(unittest.TestCase):
    def test_master_contains_required_styles_numbering_and_page_fields(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = build_master_template(Path(tmp) / "master.dotx")
            result = inspect_word_package(path)
            self.assertEqual(result.package_kind, "dotx")
            self.assertTrue({"VBTitle", "VBHeading1", "VBHeading2", "VBBody", "VBLabel", "VBNote", "VBSignature"}.issubset(result.style_ids))
            self.assertGreaterEqual(result.numbering_definition_count, 2)
            self.assertEqual(result.header_count, 1)
            self.assertEqual(result.footer_count, 1)
            self.assertIn("PAGE", result.field_codes)
            self.assertIn("NUMPAGES", result.field_codes)
```

- [ ] **Step 2: Run the test and verify the master builder is missing**

Run:

```bash
PYTHONPATH=print-system/src /Users/thevladbog/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 -m unittest print-system/tests/test_master_template.py -v
```

Expected: FAIL because `vb_print.word.master` does not exist.

- [ ] **Step 3: Implement exact Paper Signal styles and page geometry**

Define named styles for title, subtitle, three heading levels, body, label, note, table head/body, amount, signature, and footer. Set every font family, size, colour, weight, line height, before/after spacing, keep-with-next rule, and widow/orphan behaviour explicitly from `PRINT_TOKENS`. Set A4 portrait, 18 mm side margins, 16 mm top/bottom margins, and an amber top rule that does not carry semantic meaning.

- [ ] **Step 4: Implement real numbering and computed footer fields**

Create one multilevel clause definition and one bullet definition in `numbering.xml`. Add footer runs with the exact visible structure `PAGE`, literal ` из `, and `NUMPAGES`; use proper `w:fldChar` begin/separate/end nodes and cached display values `1 из 1`.

- [ ] **Step 5: Build and inspect the versioned DOTX**

Run:

```bash
PYTHONPATH=print-system/src /Users/thevladbog/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 -m vb_print.word.master print-system/templates/v-b-paper-signal.dotx
```

Expected: file exists, opens structurally as DOTX, and contains the required styles and fields.

- [ ] **Step 6: Run focused tests**

Run the Step 2 command.

Expected: PASS.

- [ ] **Step 7: Commit the master template**

```bash
git add print-system/src/vb_print/word/styles.py print-system/src/vb_print/word/components.py print-system/src/vb_print/word/master.py print-system/templates/v-b-paper-signal.dotx print-system/tests/test_master_template.py
git commit -m "feat(print): build Paper Signal Word master"
```

### Task 4: Letterhead and universal form templates

**Files:**
- Create: `print-system/src/vb_print/word/templates.py`
- Create: `print-system/templates/v-b-letterhead.docx`
- Create: `print-system/templates/v-b-form-base.docx`
- Test: `print-system/tests/test_base_templates.py`

**Interfaces:**
- Consumes: master DOTX, shared components, named controls.
- Produces: `build_letterhead(master, output)`, `build_form_base(master, output)`, and the two editable source artefacts.

- [ ] **Step 1: Write failing base-template tests**

```python
import tempfile
import unittest
from pathlib import Path
from vb_print.inspect import inspect_word_package
from vb_print.word.templates import build_form_base, build_letterhead


class BaseTemplatesTest(unittest.TestCase):
    def test_letterhead_and_form_have_codes_and_named_fields(self):
        master = Path("print-system/templates/v-b-paper-signal.dotx")
        with tempfile.TemporaryDirectory() as tmp:
            letterhead = build_letterhead(master, Path(tmp) / "letterhead.docx")
            form = build_form_base(master, Path(tmp) / "form.docx")
            letterhead_info = inspect_word_package(letterhead)
            form_info = inspect_word_package(form)
            self.assertIn("VBT-LTR-01", letterhead_info.visible_text)
            self.assertIn("DOCUMENT_NUMBER", form_info.content_control_tags)
            self.assertIn("ISSUER_MODE", form_info.content_control_tags)
            self.assertIn("VBT-FRM-01", form_info.visible_text)
```

- [ ] **Step 2: Run and verify the template builders are absent**

Run:

```bash
PYTHONPATH=print-system/src /Users/thevladbog/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 -m unittest print-system/tests/test_base_templates.py -v
```

Expected: FAIL because `vb_print.word.templates` does not exist.

- [ ] **Step 3: Implement shared first-page and editable-field components**

Implement `add_document_identity`, `add_party_summary`, `add_definition_block`, `add_signature_block`, and `add_instruction_note`. The form base includes visible example fields and a short non-printing instruction section identified by style `VBInstructions`; the release builder removes that section from reference PDFs.

- [ ] **Step 4: Build both versioned templates from the DOTX**

Run:

```bash
PYTHONPATH=print-system/src /Users/thevladbog/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 -m vb_print.word.templates base --master print-system/templates/v-b-paper-signal.dotx --output-dir print-system/templates
```

Expected: both DOCX files exist and retain DOTX styles, headers, and footers.

- [ ] **Step 5: Run the focused tests**

Run the Step 2 command.

Expected: PASS.

- [ ] **Step 6: Commit the base templates**

```bash
git add print-system/src/vb_print/word/templates.py print-system/templates/v-b-letterhead.docx print-system/templates/v-b-form-base.docx print-system/tests/test_base_templates.py
git commit -m "feat(print): add letterhead and universal form"
```

### Task 5: Contract and specification templates

**Files:**
- Modify: `print-system/src/vb_print/word/templates.py`
- Create: `print-system/templates/v-b-contract.docx`
- Create: `print-system/templates/v-b-specification.docx`
- Test: `print-system/tests/test_contract_templates.py`

**Interfaces:**
- Consumes: `build_form_base`, real clause numbering, party and signature components.
- Produces: `build_contract(master, output)`, `build_specification(master, output)` and structurally complete editable templates without legal wording.

- [ ] **Step 1: Write failing contract-family tests**

```python
import tempfile
import unittest
from pathlib import Path
from vb_print.inspect import inspect_word_package
from vb_print.word.templates import build_contract, build_specification


class ContractTemplatesTest(unittest.TestCase):
    def test_contract_family_has_real_numbering_and_required_structure(self):
        master = Path("print-system/templates/v-b-paper-signal.dotx")
        with tempfile.TemporaryDirectory() as tmp:
            contract = inspect_word_package(build_contract(master, Path(tmp) / "contract.docx"))
            specification = inspect_word_package(build_specification(master, Path(tmp) / "spec.docx"))
            self.assertIn("VBT-AGR-01", contract.visible_text)
            self.assertIn("VBT-SOW-01", specification.visible_text)
            self.assertGreaterEqual(contract.numbering_definition_count, 2)
            self.assertIn("CUSTOMER_NAME", contract.content_control_tags)
            self.assertIn("SERVICE_PERIOD", specification.content_control_tags)
            self.assertTrue(contract.has_keep_together_signature_block)
```

- [ ] **Step 2: Run and verify the new builders fail**

Run:

```bash
PYTHONPATH=print-system/src /Users/thevladbog/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 -m unittest print-system/tests/test_contract_templates.py -v
```

Expected: FAIL because `build_contract` and `build_specification` are not exported.

- [ ] **Step 3: Implement the contract skeleton**

Add the first-page party summary followed by explicitly labelled placeholder sections for subject, work procedure, price and payment, acceptance, rights and obligations, intellectual-property terms, confidentiality, liability, term and termination, dispute process, final provisions, party details, and signatures. The labels are structural prompts, not legal clauses. Use real multilevel numbering and `keep_with_next` on headings.

- [ ] **Step 4: Implement the specification skeleton**

Add structured sections for scope, deliverables, exclusions, dependencies, stages, acceptance criteria, schedule, price, responsibilities, and signatures. Use tables only for stages, deliverables, acceptance criteria, and price rows; set explicit widths and repeating table headers.

- [ ] **Step 5: Build both versioned templates and run tests**

Run:

```bash
PYTHONPATH=print-system/src /Users/thevladbog/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 -m vb_print.word.templates contracts --master print-system/templates/v-b-paper-signal.dotx --output-dir print-system/templates
PYTHONPATH=print-system/src /Users/thevladbog/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 -m unittest print-system/tests/test_contract_templates.py -v
```

Expected: both commands exit 0; tests PASS.

- [ ] **Step 6: Commit the contract family**

```bash
git add print-system/src/vb_print/word/templates.py print-system/templates/v-b-contract.docx print-system/templates/v-b-specification.docx print-system/tests/test_contract_templates.py
git commit -m "feat(print): add contract and specification templates"
```

### Task 6: Invoice and acceptance-act templates

**Files:**
- Modify: `print-system/src/vb_print/word/components.py`
- Modify: `print-system/src/vb_print/word/templates.py`
- Create: `print-system/templates/v-b-invoice.docx`
- Create: `print-system/templates/v-b-act.docx`
- Test: `print-system/tests/test_financial_templates.py`

**Interfaces:**
- Consumes: named party fields, explicit table geometry, total and signature components.
- Produces: `build_invoice(master, output)`, `build_act(master, output)`, `add_line_items_table`, `add_total_block`.

- [ ] **Step 1: Write failing financial-template tests**

```python
import tempfile
import unittest
from pathlib import Path
from vb_print.inspect import inspect_word_package
from vb_print.word.templates import build_act, build_invoice


class FinancialTemplatesTest(unittest.TestCase):
    def test_invoice_and_act_have_explicit_tables_totals_and_signatures(self):
        master = Path("print-system/templates/v-b-paper-signal.dotx")
        with tempfile.TemporaryDirectory() as tmp:
            invoice = inspect_word_package(build_invoice(master, Path(tmp) / "invoice.docx"))
            act = inspect_word_package(build_act(master, Path(tmp) / "act.docx"))
            self.assertIn("VBT-INV-01", invoice.visible_text)
            self.assertIn("VBT-ACT-01", act.visible_text)
            self.assertTrue(invoice.tables_have_explicit_geometry)
            self.assertTrue(act.tables_have_repeating_headers)
            self.assertIn("TOTAL", invoice.content_control_tags)
            self.assertIn("SERVICE_PERIOD", act.content_control_tags)
            self.assertTrue(invoice.has_keep_together_signature_block)
```

- [ ] **Step 2: Run and verify the builders are missing**

Run:

```bash
PYTHONPATH=print-system/src /Users/thevladbog/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 -m unittest print-system/tests/test_financial_templates.py -v
```

Expected: FAIL because the financial builders do not exist.

- [ ] **Step 3: Implement invoice and act components**

The invoice includes supplier, customer, basis, payment details, line items, tax treatment, subtotal, total, amount in words, and signature. The act includes parties, basis, service period, accepted line items, total, a structured result placeholder, and two signatures. Use short-value columns for quantity and amount, narrative width for line-item names, no fixed row height, and a repeated header on page continuation.

- [ ] **Step 4: Build both versioned templates and run tests**

Run:

```bash
PYTHONPATH=print-system/src /Users/thevladbog/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 -m vb_print.word.templates finance --master print-system/templates/v-b-paper-signal.dotx --output-dir print-system/templates
PYTHONPATH=print-system/src /Users/thevladbog/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 -m unittest print-system/tests/test_financial_templates.py -v
```

Expected: both commands exit 0; tests PASS.

- [ ] **Step 5: Commit the financial templates**

```bash
git add print-system/src/vb_print/word/components.py print-system/src/vb_print/word/templates.py print-system/templates/v-b-invoice.docx print-system/templates/v-b-act.docx print-system/tests/test_financial_templates.py
git commit -m "feat(print): add invoice and acceptance act templates"
```

### Task 7: Issuer-mode materialisation and stress fixtures

**Files:**
- Create: `print-system/src/vb_print/word/issuer.py`
- Create: `print-system/tests/fixtures.py`
- Test: `print-system/tests/test_issuer_modes.py`

**Interfaces:**
- Consumes: issuer content-control tags and every working DOCX template.
- Produces: `materialise_issuer_mode(source, output, mode, values) -> Path`, deterministic stress copies for both issuer modes.

- [ ] **Step 1: Write failing issuer-switch tests**

```python
import tempfile
import unittest
from pathlib import Path
from vb_print.inspect import inspect_word_package
from vb_print.model import IssuerMode
from vb_print.word.issuer import materialise_issuer_mode


class IssuerModeTest(unittest.TestCase):
    def test_each_mode_removes_the_other_block_and_keeps_named_values(self):
        source = Path("print-system/templates/v-b-contract.docx")
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            sole = materialise_issuer_mode(source, tmp_path / "sole.docx", IssuerMode.SOLE_PROPRIETOR, {"DOCUMENT_NUMBER": "001"})
            person = materialise_issuer_mode(source, tmp_path / "person.docx", IssuerMode.INDIVIDUAL, {"DOCUMENT_NUMBER": "001"})
            sole_info = inspect_word_package(sole)
            person_info = inspect_word_package(person)
            self.assertIn("ISSUER_OGRNIP", sole_info.content_control_tags)
            self.assertNotIn("ISSUER_OGRNIP", person_info.content_control_tags)
            self.assertIn("001", sole_info.visible_text)
            self.assertIn("001", person_info.visible_text)
```

- [ ] **Step 2: Run and verify the issuer module is absent**

Run:

```bash
PYTHONPATH=print-system/src /Users/thevladbog/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 -m unittest print-system/tests/test_issuer_modes.py -v
```

Expected: FAIL because `vb_print.word.issuer` does not exist.

- [ ] **Step 3: Implement deterministic issuer selection**

Tag the alternative blocks as `ISSUER_BLOCK_SOLE_PROPRIETOR` and `ISSUER_BLOCK_INDIVIDUAL`. `materialise_issuer_mode` clones the source package, removes only the non-selected block, fills supplied named controls, updates `ISSUER_MODE`, and leaves unknown or absent optional fields untouched. It must reject unknown field names and invalid modes with `ValueError`.

- [ ] **Step 4: Add exact stress values**

`tests/fixtures.py` supplies a 100-character issuer display name, a 160-character customer display name, multiline addresses, 34-character accounts, 12 line items, a 4-line service description, and the external example number `001`. Use conspicuous synthetic values beginning with `[ТЕСТ]`; include no plausible real INN, OGRNIP, BIK, or account number.

- [ ] **Step 5: Run issuer and all prior tests**

Run:

```bash
PYTHONPATH=print-system/src /Users/thevladbog/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 -m unittest discover -s print-system/tests -p 'test_*.py' -v
```

Expected: PASS.

- [ ] **Step 6: Commit issuer switching**

```bash
git add print-system/src/vb_print/word/issuer.py print-system/tests/fixtures.py print-system/tests/test_issuer_modes.py
git commit -m "feat(print): materialise issuer variants"
```

### Task 8: Explicit-page PDF design-system guide

**Files:**
- Create: `print-system/content/brandbook.ru.json`
- Create: `print-system/src/vb_print/pdf/__init__.py`
- Create: `print-system/src/vb_print/pdf/fonts.py`
- Create: `print-system/src/vb_print/pdf/components.py`
- Create: `print-system/src/vb_print/pdf/brandbook.py`
- Create: `output/pdf/v-b-print-design-system.pdf`
- Test: `print-system/tests/test_brandbook.py`

**Interfaces:**
- Consumes: `PRINT_TOKENS`, vendored TTFs, print wordmark, template codes, approved 14-section content manifest.
- Produces: `build_brandbook(content_path, output_path) -> Path`, an 18-22 page PDF with bookmarks, internal links, embedded fonts, and computed `N из M`.

- [ ] **Step 1: Write the failing brandbook contract**

```python
import tempfile
import unittest
from pathlib import Path
from pypdf import PdfReader
from vb_print.inspect import embedded_pdf_fonts
from vb_print.pdf.brandbook import build_brandbook


class BrandbookTest(unittest.TestCase):
    def test_brandbook_has_expected_pages_outline_fonts_and_numbering(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = build_brandbook(Path("print-system/content/brandbook.ru.json"), Path(tmp) / "brandbook.pdf")
            reader = PdfReader(output)
            self.assertGreaterEqual(len(reader.pages), 18)
            self.assertLessEqual(len(reader.pages), 22)
            self.assertGreaterEqual(len(reader.outline), 14)
            self.assertIn("1 из", reader.pages[0].extract_text())
            self.assertIn("IBM", " ".join(embedded_pdf_fonts(output)))
```

- [ ] **Step 2: Run and verify the PDF builder is absent**

Run:

```bash
PYTHONPATH=print-system/src /Users/thevladbog/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 -m unittest print-system/tests/test_brandbook.py -v
```

Expected: FAIL because `vb_print.pdf.brandbook` does not exist.

- [ ] **Step 3: Create the exact ordered content manifest**

Use 20 explicit pages: cover; contents; character; logo; clear space and misuse; colour; CMYK/grayscale; typography; A4 grid; hierarchy; metadata and revision; tables and totals; fields; signatures and electronic-signing considerations; contract example; specification example; invoice example; act example; monochrome and office printing; correct/incorrect examples plus DOTX quick start. Split the final combined topic across the last page using a compact quick-start panel; do not add legal or accounting claims.

- [ ] **Step 4: Implement explicit-page ReportLab components**

Register the vendored TTFs with `TTFont`. Build every page with an explicit page renderer receiving `(canvas, page_number, page_count, content)`. Add outline entries and internal links before drawing each section. Draw the signal rule and page furniture from `PRINT_TOKENS`, and render the footer exactly as `{page_number} из {page_count}`.

- [ ] **Step 5: Generate the final brandbook and run the contract test**

Run:

```bash
mkdir -p output/pdf
PYTHONPATH=print-system/src /Users/thevladbog/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 -m vb_print.pdf.brandbook print-system/content/brandbook.ru.json output/pdf/v-b-print-design-system.pdf
PYTHONPATH=print-system/src /Users/thevladbog/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 -m unittest print-system/tests/test_brandbook.py -v
```

Expected: a 20-page PDF and PASS.

- [ ] **Step 6: Commit the guide source and generated PDF**

```bash
git add print-system/content print-system/src/vb_print/pdf print-system/tests/test_brandbook.py output/pdf/v-b-print-design-system.pdf
git commit -m "feat(print): generate Paper Signal design guide"
```

### Task 9: Render, inspect, and release-audit pipeline

**Files:**
- Create: `print-system/src/vb_print/build.py`
- Modify: `print-system/src/vb_print/inspect.py`
- Create: `print-system/tests/test_release_audit.py`
- Create: `tmp/documents/.gitkeep`
- Create: `tmp/pdfs/.gitkeep`

**Interfaces:**
- Consumes: every DOTX/DOCX/PDF builder, issuer fixtures, bundled renderers.
- Produces: `build_release()`, `audit_release() -> ReleaseAudit`, reference PDFs for all Word templates, and deterministic QA directories.

- [ ] **Step 1: Write the failing release-audit test**

```python
import unittest
from pathlib import Path
from vb_print.build import audit_release, build_release


class ReleaseAuditTest(unittest.TestCase):
    def test_release_contains_every_artifact_and_no_placeholders_that_look_real(self):
        build_release()
        result = audit_release()
        self.assertEqual(result.missing_files, ())
        self.assertEqual(result.word_repair_errors, ())
        self.assertEqual(result.pdf_font_errors, ())
        self.assertEqual(result.page_number_errors, ())
        self.assertEqual(result.real_data_findings, ())
        self.assertEqual(result.visual_pages_expected, result.visual_pages_rendered)
```

- [ ] **Step 2: Run and verify the release API is absent**

Run:

```bash
PYTHONPATH=print-system/src /Users/thevladbog/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 -m unittest print-system/tests/test_release_audit.py -v
```

Expected: FAIL because `vb_print.build` does not exist.

- [ ] **Step 3: Implement one build CLI and immutable source/output boundaries**

`build_release()` rebuilds temporary copies first, compares their package hashes to the versioned templates, and fails rather than overwriting a changed checked-in Word source. It writes Word reference PDFs to `output/pdf/` and page PNGs only under `tmp/documents/` or `tmp/pdfs/`.

Define the result type exactly:

```python
@dataclass(frozen=True)
class ReleaseAudit:
    missing_files: tuple[str, ...]
    word_repair_errors: tuple[str, ...]
    pdf_font_errors: tuple[str, ...]
    page_number_errors: tuple[str, ...]
    real_data_findings: tuple[str, ...]
    visual_pages_expected: int
    visual_pages_rendered: int
```

Expose `build_release() -> None`, `audit_release() -> ReleaseAudit`, and CLI subcommand `release`.

- [ ] **Step 4: Render every Word template through the bundled renderer**

Use this exact renderer path:

```text
/Users/thevladbog/.codex/plugins/cache/openai-primary-runtime/documents/26.819.11345/skills/documents/render_docx.py
```

Render the letterhead, form, contract, specification, invoice, and act, plus sole-proprietor and individual stress copies. Use `--emit_pdf`; copy only the six clean reference PDFs to `output/pdf/` with stable names.

- [ ] **Step 5: Render the brandbook with bundled Poppler**

Run:

```bash
/Users/thevladbog/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/override/pdftoppm -png -r 150 output/pdf/v-b-print-design-system.pdf tmp/pdfs/brandbook-page
```

Expected: 20 PNG files.

- [ ] **Step 6: Implement structural release audits**

Audit ZIP integrity, package content types, styles, numbering, content-control names, field codes, explicit table geometry, repeating headers, issuer-block selection, PDF page counts, font resources, outlines, links, visible `N из M`, synthetic-placeholder prefixes, and the absence of email addresses, phone numbers, INN/OGRNIP-like digit runs, BIK-like digit runs, or bank-account-like digit runs.

- [ ] **Step 7: Run all automated checks**

Run:

```bash
PYTHONPATH=print-system/src /Users/thevladbog/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 -m unittest discover -s print-system/tests -p 'test_*.py' -v
```

Expected: PASS.

- [ ] **Step 8: Commit the release pipeline**

```bash
git add print-system/src/vb_print/build.py print-system/src/vb_print/inspect.py print-system/tests/test_release_audit.py tmp/documents/.gitkeep tmp/pdfs/.gitkeep
git commit -m "test(print): add rendered release audit"
```

### Task 10: Full visual QA, operator documentation, and final release

**Files:**
- Create: `print-system/README.md`
- Modify: `README.md`
- Update: `print-system/templates/v-b-paper-signal.dotx`
- Update: `print-system/templates/v-b-letterhead.docx`
- Update: `print-system/templates/v-b-form-base.docx`
- Update: `print-system/templates/v-b-contract.docx`
- Update: `print-system/templates/v-b-specification.docx`
- Update: `print-system/templates/v-b-invoice.docx`
- Update: `print-system/templates/v-b-act.docx`
- Update: `output/pdf/v-b-print-design-system.pdf`
- Create: `output/pdf/v-b-letterhead.pdf`
- Create: `output/pdf/v-b-form-base.pdf`
- Create: `output/pdf/v-b-contract.pdf`
- Create: `output/pdf/v-b-specification.pdf`
- Create: `output/pdf/v-b-invoice.pdf`
- Create: `output/pdf/v-b-act.pdf`

**Interfaces:**
- Consumes: the complete build and audit pipeline.
- Produces: the final user-facing release, usage instructions, recorded automated evidence, and an explicit list of unrun physical/legal/accounting gates.

- [ ] **Step 1: Build a clean release from the committed sources**

Run:

```bash
PYTHONPATH=print-system/src /Users/thevladbog/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 -m vb_print.build release
```

Expected: seven editable Word artefacts remain under `print-system/templates/`; seven final PDFs exist under `output/pdf/`; all QA PNGs remain under `tmp/`.

- [ ] **Step 2: Inspect every rendered page at 100 percent**

Review all PNGs for title density, first substantive-content position, long-name wrapping, table width, cell padding, repeated headers, signature grouping, page numbering, missing glyphs, overlap, clipping, blank gaps, and monochrome hierarchy. Record each defect by artifact and page in `tmp/visual-review.md`, fix the source, rebuild, and repeat until the defect list is empty.

- [ ] **Step 3: Verify colour and monochrome cases**

Render one colour and one grayscale copy of each first page. Confirm that the amber rule and signal marker remain identifiable by placement and shape, all required text remains dark and readable, and no meaning depends on colour alone.

- [ ] **Step 4: Write operator instructions and acceptance boundaries**

Document: font installation; creating a document from DOTX; choosing issuer mode through the materialisation tool; filling named fields; preserving styles; updating `N из M`; exporting PDF; running the build and audit commands; replacing placeholders; and the explicit requirement for legal, accounting, real-data, external-numbering, and physical-printer review.

- [ ] **Step 5: Run the final automated suite and clean-tree check**

Run:

```bash
PYTHONPATH=print-system/src /Users/thevladbog/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 -m unittest discover -s print-system/tests -p 'test_*.py' -v
git diff --check
git status --short
```

Expected: tests PASS; `git diff --check` is silent; status lists only the intended Task 10 files plus any pre-existing user-owned files.

- [ ] **Step 6: Commit the verified release**

```bash
git add README.md print-system/README.md print-system/templates output/pdf
git commit -m "feat(print): release v-b.tech document system"
```

- [ ] **Step 7: Report remaining non-automated gates plainly**

State that the artifacts passed local structural and rendered visual QA. State separately that legal wording, accounting correctness, real personal/banking details, external numbering integration, certified prepress, and physical printer acceptance remain unrun.
