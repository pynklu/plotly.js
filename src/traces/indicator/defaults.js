/**
* Copyright 2012-2019, Plotly, Inc.
* All rights reserved.
*
* This source code is licensed under the MIT license found in the
* LICENSE file in the root directory of this source tree.
*/

'use strict';

var Lib = require('../../lib');
var attributes = require('./attributes');
var handleDomainDefaults = require('../../plots/domain').defaults;
var Template = require('../../plot_api/plot_template');
var handleArrayContainerDefaults = require('../../plots/array_container_defaults');
var cn = require('./constants.js');

var handleTickValueDefaults = require('../../plots/cartesian/tick_value_defaults');
var handleTickMarkDefaults = require('../../plots/cartesian/tick_mark_defaults');
var handleTickLabelDefaults = require('../../plots/cartesian/tick_label_defaults');

function supplyDefaults(traceIn, traceOut, defaultColor, layout) {
    function coerce(attr, dflt) {
        return Lib.coerce(traceIn, traceOut, attributes, attr, dflt);
    }

    handleDomainDefaults(traceOut, layout, coerce);
    coerce('value');

    // Mode
    coerce('mode');
    traceOut._hasBigNumber = traceOut.mode.indexOf('bignumber') !== -1;
    traceOut._hasDelta = traceOut.mode.indexOf('delta') !== -1;
    traceOut._hasGauge = traceOut.mode.indexOf('gauge') !== -1;

    // Number attributes
    var bignumberFontSize;
    // if(traceOut._hasBigNumber) {
        coerce('valueformat');
        coerce('number.font.color', layout.font.color);
        coerce('number.font.family', layout.font.family);
        coerce('number.font.size', cn.defaultNumberFontSize);
        bignumberFontSize = traceOut.number.font.size;
        coerce('number.suffix');
    // }

    coerce('vmin');
    coerce('vmax', 1.5 * traceOut.value);

    // Title attributes
    coerce('title.font.color', layout.font.color);
    coerce('title.font.family', layout.font.family);
    coerce('title.font.size', 0.25 * (bignumberFontSize || cn.defaultNumberFontSize));
    coerce('title.text');

    // Gauge attributes
    var gaugeIn, gaugeOut, axisIn, axisOut;
    function coerceGauge(attr, dflt) {
        return Lib.coerce(gaugeIn, gaugeOut, attributes.gauge, attr, dflt);
    }
    function coerceGaugeAxis(attr, dflt) {
        return Lib.coerce(axisIn, axisOut, attributes.gauge.axis, attr, dflt);
    }
    if(traceOut._hasGauge) {
        gaugeIn = traceIn.gauge;
        gaugeOut = Template.newContainer(traceOut, 'gauge');
        coerceGauge('shape');
        var isBullet = traceOut._isBullet = traceOut.gauge.shape === 'bullet';
        if(!isBullet) {
            coerce('title.align', 'center');
        }
        var isAngular = traceOut._isAngular = traceOut.gauge.shape === 'angular';
        if(!isAngular) {
            coerce('align', 'center');
        }

        // gauge background
        coerceGauge('bgcolor');
        coerceGauge('borderwidth');
        coerceGauge('bordercolor');

        // gauge value indicator
        coerceGauge('value.color');
        coerceGauge('value.line.color');
        coerceGauge('value.line.width');
        var defaultValueHeight = cn.valueHeight * (traceOut.gauge.shape === 'bullet' ? 0.5 : 1);
        coerceGauge('value.height', defaultValueHeight);

        // Gauge steps
        if(gaugeIn && gaugeIn.steps) {
            handleArrayContainerDefaults(gaugeIn, gaugeOut, {
                name: 'steps',
                handleItemDefaults: stepDefaults
            });
        } else {
            gaugeOut.steps = [];
        }

        // Gauge threshold
        coerceGauge('threshold.value');
        coerceGauge('threshold.height');
        coerceGauge('threshold.width');
        coerceGauge('threshold.color');

        // Gauge axis
        axisIn = {};
        if(gaugeIn) axisIn = gaugeIn.axis || {};
        axisOut = Template.newContainer(gaugeOut, 'axis');
        handleTickValueDefaults(axisIn, axisOut, coerceGaugeAxis, 'linear');

        var opts = {outerTicks: false, font: layout.font};
        // opts.tickSuffixDflt = traceOut.number.suffix;
        handleTickLabelDefaults(axisIn, axisOut, coerceGaugeAxis, 'linear', opts);
        handleTickMarkDefaults(axisIn, axisOut, coerceGaugeAxis, 'linear', opts);
    } else {
        coerce('title.align', 'center');
        coerce('align', 'center');
    }

    // delta attributes
    // if(traceOut._hasDelta) {
        coerce('delta.font.color', layout.font.color);
        coerce('delta.font.family', layout.font.family);
        coerce('delta.font.size', (traceOut._hasBigNumber ? 0.5 : 1) * (bignumberFontSize || cn.defaultNumberFontSize));
        coerce('delta.reference', traceOut.value);
        coerce('delta.showpercentage');
        coerce('delta.valueformat', traceOut.delta.showpercentage ? '2%' : traceOut.valueformat);
        coerce('delta.increasing.symbol');
        coerce('delta.increasing.color');
        coerce('delta.decreasing.symbol');
        coerce('delta.decreasing.color');
        coerce('delta.position');
    // }
}

function stepDefaults(valueIn, valueOut) {
    function coerce(attr, dflt) {
        return Lib.coerce(valueIn, valueOut, attributes.gauge.steps, attr, dflt);
    }

    coerce('color');
    coerce('line.color');
    coerce('line.width');
    coerce('range');
    coerce('height');
}

module.exports = {
    supplyDefaults: supplyDefaults
};
