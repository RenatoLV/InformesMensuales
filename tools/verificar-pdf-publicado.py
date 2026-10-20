"""Comprueba PDF ficticios de la revisión anterior y la candidata, sin datos reales."""
import json
from pathlib import Path
from pypdf import PdfReader
import pypdfium2 as pdfium
from PIL import ImageChops, ImageStat

folder = Path(__file__).resolve().parent.parent / 'output' / 'pdf'
for version in ['remuneraciones', 'transparencia']:
    previous = folder / f'cloud-anterior-{version}.pdf'
    current = folder / f'cloud-verificacion-{version}.pdf'
    before, after = PdfReader(previous), PdfReader(current)
    old_text = '\n'.join(p.extract_text() for p in before.pages)
    new_text = '\n'.join(p.extract_text() for p in after.pages)
    assert len(before.pages) == len(after.pages), 'Cambió el número de páginas'
    assert old_text == new_text, 'Cambió el texto del PDF'
    if version == 'transparencia':
        for sensitive in ['12.345.678-5', '01/01/1990', '912345678', 'demo@example.test']:
            assert sensitive not in new_text, 'Dato privado en versión pública'
    old_doc, new_doc = pdfium.PdfDocument(previous), pdfium.PdfDocument(current)
    differences = []
    for page in range(len(new_doc)):
        a = old_doc[page].render(scale=1.25).to_pil().convert('RGB')
        b = new_doc[page].render(scale=1.25).to_pil().convert('RGB')
        assert a.size == b.size, 'Cambió el tamaño de página'
        delta = ImageStat.Stat(ImageChops.difference(a, b))
        differences.append(round(sum(delta.mean)/3, 5))
        b.save(folder / f'cloud-actual-{version}-{page+1}.png')
    print(json.dumps({'version': version, 'paginas': len(after.pages),
        'textoIdentico': True, 'diferenciaMediaPixel': differences,
        'privacidad': 'verificada' if version == 'transparencia' else 'privado'}, ensure_ascii=False))
