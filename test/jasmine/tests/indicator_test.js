var Plotly = require('@lib/index');
// var Lib = require('@src/lib');
//
var d3 = require('d3');
var createGraphDiv = require('../assets/create_graph_div');
var destroyGraphDiv = require('../assets/destroy_graph_div');
var failTest = require('../assets/fail_test');
// var click = require('../assets/click');
// var getClientPosition = require('../assets/get_client_position');
// var mouseEvent = require('../assets/mouse_event');
var supplyAllDefaults = require('../assets/supply_defaults');
var indicatorAttrs = require('@src/traces/indicator/attributes.js');
// var rgb = require('../../../src/components/color').rgb;

// var customAssertions = require('../assets/custom_assertions');
// var assertHoverLabelStyle = customAssertions.assertHoverLabelStyle;
// var assertHoverLabelContent = customAssertions.assertHoverLabelContent;

describe('Indicator defaults', function() {
    function _supply(trace, layout) {
        var gd = {
            data: [trace],
            layout: layout || {}
        };

        supplyAllDefaults(gd);

        return gd._fullData[0];
    }

    it('to number mode', function() {
        var out = _supply({type: 'indicator', value: 1});
        expect(out.mode).toBe('number');
    });

    indicatorAttrs.mode.flags.forEach(function(mode) {
        it('should not coerce container ' + mode + ' if not used', function() {
            var allModes = indicatorAttrs.mode.flags.slice();
            allModes.splice(allModes.indexOf(mode), 1);
            var out = _supply({type: 'indicator', mode: allModes.join('+'), value: 1});
            expect(out[mode]).toBe(undefined);
        });
    });

    it('defaults to formatting numbers using SI prefix', function() {
        var out = _supply({type: 'indicator', mode: 'number+delta', value: 1});
        expect(out.valueformat).toBe('.3s');
        expect(out.delta.valueformat).toBe('.3s');
    });

    it('defaults to displaying relative changes in percentage', function() {
        var out = _supply({type: 'indicator', mode: 'delta', delta: {relative: true}, value: 1});
        expect(out.delta.valueformat).toBe('2%');
    });

    // text alignment
    ['bignumber'].forEach(function(mode) {
        it('aligns to center', function() {
            var out = _supply({
                type: 'indicator',
                mode: mode,
                value: 1,
                gauge: {shape: 'angular'}
            });
            expect(out.align).toBe('center');
            expect(out.title.align).toBe('center');
        });
    });

    it('should NOT set number alignment when angular', function() {
        var out = _supply({type: 'indicator', mode: 'number+gauge', gauge: {shape: 'angular'}, value: 1});
        expect(out.align).toBe(undefined);
        expect(out.title.align).toBe('center');
    });

    it('should NOT set title alignment when bullet', function() {
        var out = _supply({type: 'indicator', mode: 'number+gauge', gauge: {shape: 'bullet'}, value: 1});
        expect(out.align).toBe('center');
        expect(out.title.align).toBe(undefined);
    });

    // font-size
    it('number font size to a large value', function() {
        var out = _supply({type: 'indicator', value: 1});
        expect(out.number.font.size).toBe(80);
    });

    it('delta font size to a fraction of number', function() {
        var out = _supply({type: 'indicator', mode: 'delta+number', value: 1, number: {font: {size: 50}}});
        expect(out.number.font.size).toBe(50);
        expect(out.delta.font.size).toBe(25);
    });

    it('title font size to a fraction of number', function() {
        var out = _supply({type: 'indicator', value: 1, number: {font: {size: 50}}});
        expect(out.number.font.size).toBe(50);
        expect(out.title.font.size).toBe(12.5);
    });
});

describe('Indicator plot', function() {
    var gd;
    beforeEach(function() {
        gd = createGraphDiv();
    });
    afterEach(destroyGraphDiv);

    describe('numbers', function() {
        function checkNumbersScale(value, msg) {
            var numbers = d3.selectAll('text.numbers');
            expect(numbers.length).toBe(1);

            var transform = numbers.attr('transform');
            expect(transform.match('scale')).toBeTruthy('cannot find scale attribute on text.numbers[0]');
            var scale = transform.match(/.*scale\((.*)\)/)[1];

            expect(scale).toBeCloseTo(value, 1, msg);
        }

        it('numbers scale down to fit figure size', function(done) {
            Plotly.newPlot(gd, [{
                type: 'indicator',
                value: 500,
                valueformat: '0.f'
            }], {width: 400, height: 400})
            .then(function() {
                checkNumbersScale(1, 'initialy at normal scale');
                return Plotly.relayout(gd, {width: 200, height: 200});
            })
            .then(function() {
                checkNumbersScale(0.2, 'should scale down');
                return Plotly.relayout(gd, {width: 400, height: 400});
            })
            .then(function() {
                checkNumbersScale(1, 'should scale up');
            })
            .catch(failTest)
            .then(done);
        });

        it('if domain size is constant, numbers scale down but never back up', function(done) {
            Plotly.newPlot(gd, [{
                type: 'indicator',
                value: 1,
                valueformat: '0.f'
            }], {width: 400, height: 400})
            .then(function() {
                checkNumbersScale(1, 'initialy at normal scale');
                return Plotly.restyle(gd, 'value', [1E6]);
            })
            .then(function() {
                checkNumbersScale(0.7, 'should scale down');
                return Plotly.restyle(gd, 'value', [1]);
            })
            .then(function() {
                checkNumbersScale(0.7, 'should not scale up');
            })
            .catch(failTest)
            .then(done);
        });

        // it('if font-size is specified, never scale', function(done) {
        //     Plotly.newPlot(gd, [{
        //         type: 'indicator',
        //         value: 1,
        //         valueformat: '0.f',
        //         number: {font: {size: 100}}
        //     }], {width: 400, height: 400})
        //     .then(function() {
        //         checkNumbersScale(1, 'initialy at normal scale');
        //         return Plotly.restyle(gd, 'value', [1E6]);
        //     })
        //     .then(function() {
        //         checkNumbersScale(1, 'should not rescale');
        //         return Plotly.restyle(gd, 'value', [1]);
        //     })
        //     .then(function() {
        //         checkNumbersScale(1, 'should not rescale');
        //     })
        //     .catch(failTest)
        //     .then(done);
        // });
    });

    describe('delta', function() {
        function assertContent(txt) {
            var sel = d3.selectAll('tspan.delta');
            expect(sel.length).toBe(1);
            expect(sel.text()).toBe(txt);
        }
        it('displays relative changes', function(done) {
            Plotly.newPlot(gd, [{
                type: 'indicator',
                mode: 'number+delta',
                value: 110,
                delta: {reference: 100}
            }], {width: 400, height: 400})
            .then(function() {
                assertContent(gd._fullData[0].delta.increasing.symbol + '10.0');
                return Plotly.restyle(gd, 'delta.relative', true);
            })
            .then(function() {
                assertContent(gd._fullData[0].delta.increasing.symbol + '10%');
                return Plotly.restyle(gd, 'delta.valueformat', '.3f');
            })
            .then(function() {
                assertContent(gd._fullData[0].delta.increasing.symbol + '0.100');
            })
            .catch(failTest)
            .then(done);
        });
    });

    describe('angular gauge', function() {

    });

    describe('bullet gauge', function() {

    });

    it('restyle between modes', function(done) {
        function assertElementCnt(sel, cnt) {
            var el = d3.selectAll(sel);
            expect(el.size()).toBe(cnt, 'selection "' + sel + '" does not have size ' + cnt);
        }
        function assertGauge(shape, cnt) {
            assertElementCnt('g.' + shape, cnt);
            assertElementCnt('g.' + shape + 'axis', cnt);
        }
        function assert(flags) {
            assertElementCnt('tspan.number', flags[0]);
            assertElementCnt('tspan.delta', flags[1]);
            assertGauge('angular', flags[2]);
            assertGauge('bullet', flags[3]);
        }

        Plotly.newPlot(gd, [{
            type: 'indicator',
            value: 100,
            mode: 'number+delta+gauge'
        }])
        .then(function() {
            assert([1, 1, 1, 0]);
            return Plotly.restyle(gd, 'mode', 'number+delta');
        })
        .then(function() {
            assert([1, 1, 0, 0]);
            return Plotly.restyle(gd, 'mode', 'number');
        })
        .then(function() {
            assert([1, 0, 0, 0]);
            return Plotly.restyle(gd, 'mode', 'delta');
        })
        .then(function() {
            assert([0, 1, 0, 0]);
            return Plotly.restyle(gd, 'mode', 'gauge');
        })
        .then(function() {
            assert([0, 0, 1, 0]);
            return Plotly.restyle(gd, 'gauge.shape', 'bullet');
        })
        .then(function() {
            assert([0, 0, 0, 1]);
            return Plotly.restyle(gd, 'mode', 'number+delta+gauge');
        })
        .then(function() {
            assert([1, 1, 0, 1]);
        })
        .catch(failTest)
        .then(done);
    });
});

// It is animatable (check Sunburst)

// Add couple mocks
