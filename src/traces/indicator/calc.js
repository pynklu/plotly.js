/**
* Copyright 2012-2019, Plotly, Inc.
* All rights reserved.
*
* This source code is licensed under the MIT license found in the
* LICENSE file in the root directory of this source tree.
*/

'use strict';

// var Lib = require('../../lib');

function calc(gd, trace) {
    // var len = trace.values.length;

    var cd = [];

    // var singleValue = len === 1;
    // var lastReading = trace.values[len - 1];
    // var secondLastReading = singleValue ? lastReading : trace.values[len - 2];
    var lastReading = trace.value;
    var secondLastReading = trace.delta ? trace.delta.reference : trace.value;
    cd[0] = {
        y: lastReading,
        lastY: secondLastReading,

        delta: lastReading - secondLastReading,
        relativeDelta: (lastReading - secondLastReading) / secondLastReading,
        // historical: trace.values
    };
    return cd;
}

module.exports = {
    calc: calc
};
