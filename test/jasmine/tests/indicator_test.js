// var Plotly = require('@lib/index');
// var Lib = require('@src/lib');
//
// var d3 = require('d3');
// var createGraphDiv = require('../assets/create_graph_div');
// var destroyGraphDiv = require('../assets/destroy_graph_div');
// var failTest = require('../assets/fail_test');
// var click = require('../assets/click');
// var getClientPosition = require('../assets/get_client_position');
// var mouseEvent = require('../assets/mouse_event');
var supplyAllDefaults = require('../assets/supply_defaults');
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

    it('to bignumber mode', function() {
        var out = _supply({type: 'indicator', values: [1, 2, 3]});
        expect(out.mode).toBe('bignumber');
    });
});
