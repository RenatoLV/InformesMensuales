const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../JS_CORE.html'), 'utf8').replace(/^<script>\s*|\s*<\/script>\s*$/g, ''), context);
test('el ingreso forma puntos y guion y limita el cuerpo a ocho dígitos más verificador', () => {
    assert.equal(context.formatearRutVisual('218160271'), '21.816.027-1');
    assert.equal(context.formatearRutVisual('218160271111'), '21.816.027-1');
    assert.equal(context.formatearRutVisual('21.816.027-1'), '21.816.027-1');
    assert.equal(context.formatearRutVisual('abc12345678k'), '12.345.678-K');
    assert.equal(context.formatearRutVisual('12345678'), '1.234.567-8');
    assert.equal(context.formatearRutVisual('K'), '');
    assert.equal(context.formatearRutVisual(''), '');
});
test('el ingreso valida el dígito verificador antes de consultar Apps Script', () => {
    assert.equal(context.esRutIngresoValido('21.816.027-1'), true);
    assert.equal(context.esRutIngresoValido('12.345.678-5'), true);
    assert.equal(context.esRutIngresoValido('21.816.027-2'), false);
    assert.equal(context.esRutIngresoValido('0-0'), false);
    assert.equal(context.esRutIngresoValido('21'), false);
});
