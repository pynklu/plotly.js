/**
* Copyright 2012-2019, Plotly, Inc.
* All rights reserved.
*
* This source code is licensed under the MIT license found in the
* LICENSE file in the root directory of this source tree.
*/

'use strict';

var d3 = require('d3');

var Lib = require('../../lib');
var rad2deg = Lib.rad2deg;
var MID_SHIFT = require('../../constants/alignment').MID_SHIFT;
var Drawing = require('../../components/drawing');
var cn = require('./constants');
var svgTextUtils = require('../../lib/svg_text_utils');

var Axes = require('../../plots/cartesian/axes');
var handleAxisDefaults = require('../../plots/cartesian/axis_defaults');
var handleAxisPositionDefaults = require('../../plots/cartesian/position_defaults');
var axisLayoutAttrs = require('../../plots/cartesian/layout_attributes');
var setConvertPolar = require('../../plots/polar/set_convert');

var anchor = {
    'left': 'start',
    'center': 'middle',
    'right': 'end'
};
var position = {
    'left': 0,
    'center': 0.5,
    'right': 1
};

module.exports = function plot(gd, cdModule, transitionOpts, makeOnCompleteCallback) {
    var fullLayout = gd._fullLayout;
    var onComplete;

    // If transition config is provided, then it is only a partial replot and traces not
    // updated are removed.
    var hasTransition = transitionOpts && transitionOpts.duration > 0;

    if(hasTransition) {
        if(makeOnCompleteCallback) {
            // If it was passed a callback to register completion, make a callback. If
            // this is created, then it must be executed on completion, otherwise the
            // pos-transition redraw will not execute:
            onComplete = makeOnCompleteCallback();
        }
    }

    var bBoxRef = gd.getBoundingClientRect();

    Lib.makeTraceGroups(fullLayout._indicatorlayer, cdModule, 'trace').each(function(cd) {
        var cd0 = cd[0];
        var trace = cd0.trace;
        var plotGroup = d3.select(this);

        // Elements in trace
        var hasBigNumber = trace._hasBigNumber;
        var hasDelta = trace._hasDelta;
        var hasGauge = trace._hasGauge;
        var isAngular = hasGauge && trace.gauge.shape === 'angular';
        var isBullet = hasGauge && trace.gauge.shape === 'bullet';

        // Domain size
        var domain = trace.domain;
        var size = {
            w: fullLayout._size.w * (domain.x[1] - domain.x[0]),
            h: fullLayout._size.h * (domain.y[1] - domain.y[0]),
            l: fullLayout._size.l + fullLayout._size.w * domain.x[0],
            r: fullLayout._size.r + fullLayout._size.w * (1 - domain.x[1]),
            t: fullLayout._size.t + fullLayout._size.h * (1 - domain.y[1]),
            b: fullLayout._size.b + fullLayout._size.h * (domain.y[0])
        };

        var range = [trace.vmin, trace.vmax];

        // title
        var titlePadding = cn.titlePadding;

        // circular gauge
        var theta = Math.PI / 2;
        var radius = Math.min(size.w / 2, size.h); // fill domain
        var innerRadius = cn.innerRadius * radius;
        function valueToAngle(v) {
            var angle = (v - trace.vmin) / (trace.vmax - trace.vmin) * Math.PI - theta;
            if(angle < -theta) return -theta;
            if(angle > theta) return theta;
            return angle;
        }

        // Position elements
        var titleY;
        var numbersX, numbersY, numbersScaler;
        var numbersAlign = trace.align || 'center';
        var numbersAnchor = anchor[numbersAlign];
        var gaugePosition = [];

        var centerX = size.l + size.w / 2;
        var centerY = size.t + size.h / 2;

        numbersY = centerY;

        if(!hasGauge) {
            numbersX = size.l + position[numbersAlign] * size.w;
            numbersScaler = function(el) {
                return fitTextInsideBox(el, 0.9 * size.w, 0.9 * size.h);
            };
        } else {
            if(isAngular) {
                numbersX = centerX - 0.85 * innerRadius + 2 * 0.85 * innerRadius * position[numbersAlign];
                numbersY = size.t + size.h / 2 + radius / 2;
                gaugePosition = [centerX, numbersY];

                numbersScaler = function(el) {
                    return fitTextInsideCircle(el, 0.9 * innerRadius);
                };
            }
            if(isBullet) {
                var padding = cn.bulletPadding;
                var p = (1 - cn.bulletNumberDomainSize) + padding;
                numbersX = size.l + (p + (1 - p) * position[numbersAlign]) * size.w;
                titleY = centerY;

                numbersScaler = function(el) {
                    return fitTextInsideBox(el, (cn.bulletNumberDomainSize - padding) * size.w, size.h);
                };
            }
        }

        // Draw numbers
        var numbersOpts = {
            numbersX: numbersX,
            numbersY: numbersY,
            numbersAnchor: numbersAnchor,
            numbersScaler: numbersScaler,
            hasTransition: hasTransition,
            transitionOpts: transitionOpts,
            onComplete: onComplete
        };
        drawNumbers(gd, plotGroup, cd, numbersOpts);

        // Draw circular gauge
        var data = cd.filter(function() {return isAngular;});
        var angularGauge = plotGroup.selectAll('g.angular').data(data);
        angularGauge.exit().remove();

        var angularaxisLayer = plotGroup.selectAll('g.angularaxis').data(data);
        angularaxisLayer.exit().remove();

        // Draw bullet gauge
        data = cd.filter(function() {return isBullet;});
        var bullet = d3.select(this).selectAll('g.bullet').data(data);
        bullet.exit().remove();

        // Draw cartesian axis
        var bulletaxis = d3.select(this).selectAll('g.bulletaxis').data(data);
        bulletaxis.exit().remove();

        // Draw gauges
        function arcPathGenerator(size) {
            return d3.svg.arc()
                      .innerRadius((innerRadius + radius) / 2 - size / 2 * (radius - innerRadius))
                      .outerRadius((innerRadius + radius) / 2 + size / 2 * (radius - innerRadius))
                      .startAngle(-theta);
        }

        function drawArc(p) {
            p
                .attr('d', function(d) {
                    return arcPathGenerator(d.height)
                      .startAngle(valueToAngle(d.range[0]))
                      .endAngle(valueToAngle(d.range[1]))();
                });
        }

        if(hasGauge) {
            // preparing axis
            var ax, vals, transFn, tickSign, shift;
            var opts = trace.gauge.axis;

            // Reexpress our background attributes for drawing
            var gaugeBg = {
                range: [trace.vmin, trace.vmax],
                color: trace.gauge.bgcolor,
                line: {
                    color: trace.gauge.bordercolor,
                    width: 0
                },
                height: 1
            };

            var gaugeOutline = {
                range: [trace.vmin, trace.vmax],
                color: 'rgba(0, 0, 0, 0)',
                line: {
                    color: trace.gauge.bordercolor,
                    width: trace.gauge.borderwidth
                },
                height: 1
            };

            if(isAngular) {
                // Enter gauge and axis
                angularGauge.enter().append('g').classed('angular', true);
                angularGauge.attr('transform', strTranslate(gaugePosition[0], gaugePosition[1]));

                angularaxisLayer.enter().append('g')
                    .classed('angularaxis', true)
                    .classed('crisp', true);
                angularaxisLayer.selectAll('g.' + 'angularaxis' + 'tick,path').remove();

                ax = mockAxis(gd, opts);
                ax.type = 'indicator';
                ax.range = [trace.vmin, trace.vmax];
                ax._id = 'angularaxis';
                ax.direction = 'clockwise';
                ax.rotation = 180;
                setConvertPolar(ax, {sector: [0, 180]}, fullLayout);
                ax.setGeometry();
                ax.setScale();

                // 't'ick to 'g'eometric radians is used all over the place here
                var t2g = function(d) { return ax.t2g(d.x); };

                var labelFns = {};
                var out = Axes.makeLabelFns(ax, 0);
                var labelStandoff = out.labelStandoff;

                labelFns.xFn = function(d) {
                    var rad = t2g(d);
                    return Math.cos(rad) * labelStandoff;
                };

                labelFns.yFn = function(d) {
                    var rad = t2g(d);
                    var ff = Math.sin(rad) > 0 ? 0.2 : 1;
                    return -Math.sin(rad) * (labelStandoff + d.fontSize * ff) +
                            Math.abs(Math.cos(rad)) * (d.fontSize * MID_SHIFT);
                };

                labelFns.anchorFn = function(d) {
                    var rad = t2g(d);
                    var cos = Math.cos(rad);
                    return Math.abs(cos) < 0.1 ?
                            'middle' :
                            (cos > 0 ? 'start' : 'end');
                };

                labelFns.heightFn = function(d, a, h) {
                    var rad = t2g(d);
                    return -0.5 * (1 + Math.sin(rad)) * h;
                };

                var _transFn = function(rad) {
                    return strTranslate(gaugePosition[0] + radius * Math.cos(rad), gaugePosition[1] - radius * Math.sin(rad));
                };
                transFn = function(d) {
                    return _transFn(t2g(d));
                };
                var transFn2 = function(d) {
                    var rad = t2g(d);
                    return _transFn(rad) + strRotate(-rad2deg(rad));
                };

                vals = Axes.calcTicks(ax);
                tickSign;

                if(ax.visible) {
                    tickSign = ax.ticks === 'inside' ? -1 : 1;
                    var pad = (ax.linewidth || 1) / 2;

                    Axes.drawTicks(gd, ax, {
                        vals: vals,
                        layer: angularaxisLayer,
                        path: 'M' + (tickSign * pad) + ',0h' + (tickSign * ax.ticklen),
                        transFn: transFn2,
                        crips: true
                    });

                    Axes.drawLabels(gd, ax, {
                        vals: vals,
                        layer: angularaxisLayer,
                        transFn: transFn,
                        labelFns: labelFns
                    });
                }

                // Reexpress threshold for drawing
                var v = trace.gauge.threshold.value;
                var thresholdArc = {
                    range: [v, v],
                    color: trace.gauge.threshold.color,
                    line: {
                        color: trace.gauge.threshold.color,
                        width: trace.gauge.threshold.width
                    },
                    height: trace.gauge.threshold.height
                };

                // Draw background + steps
                var arcs = [gaugeBg].concat(trace.gauge.steps);
                if(v) arcs.push(thresholdArc);
                var targetArc = angularGauge.selectAll('g.targetArc').data(arcs);
                targetArc.enter().append('g').classed('targetArc', true).append('path');
                targetArc.select('path').call(drawArc).call(styleShape);
                targetArc.exit().remove();

                    // Draw foreground with transition
                var valueArcPath = arcPathGenerator(trace.gauge.value.height);
                var fgArc = angularGauge.selectAll('g.fgArc').data([trace.gauge.value]);
                fgArc.enter().append('g').classed('fgArc', true).append('path');

                var fgArcPath = fgArc.select('path');
                if(hasTransition) {
                    fgArcPath
                        .transition()
                        .duration(transitionOpts.duration)
                        .ease(transitionOpts.easing)
                        .each('end', function() { onComplete && onComplete(); })
                        .each('interrupt', function() { onComplete && onComplete(); })
                        .attrTween('d', arcTween(valueArcPath, valueToAngle(cd[0].lastY), valueToAngle(cd[0].y)));
                } else {
                    fgArcPath
                        .attr('d', valueArcPath.endAngle(valueToAngle(cd[0].y)));
                }
                fgArcPath.call(styleShape);
                fgArc.exit().remove();

                var gaugeBorder = angularGauge.selectAll('g.gaugeOutline').data([gaugeOutline]);
                gaugeBorder.enter().append('g').classed('gaugeOutline', true).append('path');
                gaugeBorder.select('path').call(drawArc).call(styleShape);
                gaugeBorder.exit().remove();
            }

            if(isBullet) {
                // Enter bullet, axis
                bullet.enter().append('g').classed('bullet', true);
                bullet.attr('transform', 'translate(' + size.l + ', ' + size.t + ')');

                bulletaxis.enter().append('g')
                    .classed('bulletaxis', true)
                    .classed('crisp', true);
                bulletaxis.selectAll('g.' + 'xbulletaxis' + 'tick,path').remove();

                // Draw bullet
                var bulletHeight = size.h; // use all vertical domain
                var innerBulletHeight = trace.gauge.value.height * bulletHeight;
                var bulletLeft = domain.x[0];
                var bulletRight = domain.x[0] + (domain.x[1] - domain.x[0]) * ((hasBigNumber || hasDelta) ? (1 - cn.bulletNumberDomainSize) : 1);

                ax = mockAxis(gd, opts, range);
                ax._id = 'xbulletaxis';
                ax.domain = [bulletLeft, bulletRight];
                ax.setScale();

                vals = Axes.calcTicks(ax);
                transFn = Axes.makeTransFn(ax);
                tickSign = Axes.getTickSigns(ax)[2];

                shift = size.t + size.h;
                if(ax.visible) {
                    Axes.drawTicks(gd, ax, {
                        vals: ax.ticks === 'inside' ? Axes.clipEnds(ax, vals) : vals,
                        layer: bulletaxis,
                        path: Axes.makeTickPath(ax, shift, tickSign),
                        transFn: transFn
                    });

                    Axes.drawLabels(gd, ax, {
                        vals: vals,
                        layer: bulletaxis,
                        transFn: transFn,
                        labelFns: Axes.makeLabelFns(ax, shift)
                    });
                }

                // Draw bullet background, steps and thresholds
                var boxes = [gaugeBg].concat(trace.gauge.steps);
                var targetBullet = bullet.selectAll('g.targetBullet').data(boxes);
                targetBullet.enter().append('g').classed('targetBullet', true).append('rect');
                targetBullet.select('rect')
                    .attr('width', function(d) { return Math.max(0, ax.c2p(d.range[1] - d.range[0]));})
                    .attr('x', function(d) { return ax.c2p(d.range[0]);})
                    .attr('height', bulletHeight)
                    .call(styleShape);
                targetBullet.exit().remove();

                // Draw value bar with transitions
                var fgBullet = bullet.selectAll('g.fgBullet').data([trace.gauge.value]);
                fgBullet.enter().append('g').classed('fgBullet', true).append('rect');
                fgBullet.select('rect')
                    .attr('height', innerBulletHeight)
                    .attr('y', (bulletHeight - innerBulletHeight) / 2)
                    .call(styleShape);
                if(hasTransition) {
                    fgBullet.select('rect')
                        .transition()
                        .duration(transitionOpts.duration)
                        .ease(transitionOpts.easing)
                        .each('end', function() { onComplete && onComplete(); })
                        .each('interrupt', function() { onComplete && onComplete(); })
                        .attr('width', Math.max(0, ax.c2p(Math.min(trace.vmax, cd[0].y))));
                } else {
                    fgBullet.select('rect')
                        .attr('width', Math.max(0, ax.c2p(Math.min(trace.vmax, cd[0].y))));
                }
                fgBullet.exit().remove();

                data = cd.filter(function() {return trace.gauge.threshold.value;});
                var threshold = bullet.selectAll('g.threshold').data(data);
                threshold.enter().append('g').classed('threshold', true).append('line');
                threshold.select('line')
                    .attr('x1', ax.c2p(trace.gauge.threshold.value))
                    .attr('x2', ax.c2p(trace.gauge.threshold.value))
                    .attr('y1', (1 - trace.gauge.threshold.height) / 2 * bulletHeight)
                    .attr('y2', (1 - (1 - trace.gauge.threshold.height) / 2) * bulletHeight)
                    .style('stroke', trace.gauge.threshold.color)
                    .style('stroke-width', trace.gauge.threshold.width);
                threshold.exit().remove();

                var bulletOutline = bullet.selectAll('g.bulletOutline').data([gaugeOutline]);
                bulletOutline.enter().append('g').classed('bulletOutline', true).append('rect');
                bulletOutline.select('rect')
                    .attr('width', function(d) { return Math.max(0, ax.c2p(d.range[1] - d.range[0]));})
                    .attr('x', function(d) { return ax.c2p(d.range[0]);})
                    .attr('height', bulletHeight)
                    .call(styleShape);
                bulletOutline.exit().remove();
            }
        }

        // title
        var title = plotGroup.selectAll('text.title').data(cd);
        title.enter().append('text').classed('title', true);
        title
            .attr('text-anchor', function() {
                return isBullet ? anchor.right : anchor[trace.title.align];
            })
            .text(trace.title.text)
            .call(Drawing.font, trace.title.font)
            .call(svgTextUtils.convertToTspans, gd);
        title.exit().remove();
        title.attr('transform', function() {
            var titleX = size.l + size.w * position[trace.title.align];
            if(hasGauge) {
                if(isAngular) {
                    // position above axis ticks/labels
                    var bBox = angularaxisLayer.node().getBoundingClientRect();
                    titleY = bBox.top - bBoxRef.top - titlePadding;
                }
                if(isBullet) {
                    // position outside domain
                    var titlebBox = Drawing.bBox(title.node());
                    titleY = numbersY - (titlebBox.top + titlebBox.bottom) / 2;
                    titleX = size.l - cn.bulletPadding * size.w; // Outside domain, on the left
                }
            } else {
                titleY = trace._numbersTop - titlePadding;
            }
            return strTranslate(titleX, titleY);
        });
    });
};

function drawNumbers(gd, plotGroup, cd, opts) {
    var trace = cd[0].trace;
    var bignumberFontSize = trace.number.font.size;
    var deltaFontSize = trace.delta.font.size;
    var numbersX = opts.numbersX;
    var numbersY = opts.numbersY;
    var numbersAnchor = opts.numbersAnchor;

    var hasTransition = opts.hasTransition;
    var transitionOpts = opts.transitionOpts;
    var onComplete = opts.onComplete;

    // Position delta relative to bignumber
    var deltaDy = 0;
    var deltaX = 0;
    var bignumberY = 0;

    if(trace._hasDelta && trace._hasBigNumber) {
        if(trace.delta.position === 'bottom') {
            deltaDy = deltaFontSize * 1.5;
        }
        if(trace.delta.position === 'top') {
            deltaDy = -bignumberFontSize + MID_SHIFT * deltaFontSize;
        }
        if(trace.delta.position === 'right') {
            deltaX = undefined;
        }
        if(trace.delta.position === 'left') {
            deltaX = undefined;
            bignumberY = MID_SHIFT * bignumberFontSize / 2;
        }
    }
    deltaDy -= MID_SHIFT * deltaFontSize;

    var numbers = plotGroup.selectAll('text.numbers').data(cd);
    numbers.enter().append('text').classed('numbers', true);

    var data = [];
    var numberSpec = {
        class: 'number'
    };
    var deltaSpec = {
        class: 'delta'
    };
    if(trace._hasBigNumber) data.push(numberSpec);
    if(trace._hasDelta) data.push(deltaSpec);
    if(trace.delta.position === 'left') data.reverse();
    var sel = numbers.selectAll('tspan').data(data);
    sel.enter().append('tspan');
    sel
        .attr('text-anchor', function() {return numbersAnchor;})
        .attr('class', function(d) { return d.class;})
        .attr('dx', function(d, i) {
            var pos = trace.delta.position;
            // Add padding to the second tspan when it's a one-liner
            if(i === 1 && (pos === 'left' || pos === 'right')) return 10;
            return null;
        });
    sel.exit().remove();

    // bignumber
    var bignumberAx = mockAxis(gd, {tickformat: trace.valueformat});
    var fmt = function(v) { return Axes.tickText(bignumberAx, v).text;};
    var bignumberSuffix = trace.number.suffix;
    if(bignumberSuffix) bignumberSuffix = ' ' + bignumberSuffix;

    var number = numbers.select('tspan.number');
    number
        .call(Drawing.font, trace.number.font)
        .attr('x', null)
        .attr('dy', bignumberY);

    // delta
    var deltaAx = mockAxis(gd, {tickformat: trace.delta.valueformat});
    var deltaFmt = function(v) { return Axes.tickText(deltaAx, v).text;};
    if(!trace._deltaLastValue) trace._deltaLastValue = 0;
    var deltaValue = function(d) {
        var value = trace.delta.showpercentage ? d.relativeDelta : d.delta;
        return value;
    };
    var deltaFormatText = function(value) {
        if(value === 0) return '-';
        return (value > 0 ? trace.delta.increasing.symbol : trace.delta.decreasing.symbol) + deltaFmt(value);
    };
    var deltaFill = function(d) {
        return d.delta >= 0 ? trace.delta.increasing.color : trace.delta.decreasing.color;
    };
    var delta = numbers.select('tspan.delta');
    delta
        .call(Drawing.font, trace.delta.font)
        .style('fill', deltaFill)
        .attr('x', deltaX)
        .attr('dy', deltaDy);

    if(hasTransition) {
        number
            .transition()
            .duration(transitionOpts.duration)
            .ease(transitionOpts.easing)
            .each('end', function() { onComplete && onComplete(); })
            .each('interrupt', function() { onComplete && onComplete(); })
            .attrTween('text', function() {
                var that = d3.select(this);
                var interpolator = d3.interpolateNumber(cd[0].lastY, cd[0].y);
                return function(t) {
                    that.text(fmt(interpolator(t)) + bignumberSuffix);
                };
            });

        delta
            .transition()
            .duration(transitionOpts.duration)
            .ease(transitionOpts.easing)
            .each('end', function(d) { trace._deltaLastValue = deltaValue(d); onComplete && onComplete(); })
            .each('interrupt', function() { onComplete && onComplete(); })
            .attrTween('text', function(d) {
                var that = d3.select(this);
                var to = deltaValue(d);
                var from = trace._deltaLastValue;
                var interpolator = d3.interpolateNumber(from, to);
                return function(t) {
                    that.text(deltaFormatText(interpolator(t)));
                };
            });
    } else {
        number.text(fmt(cd[0].y) + bignumberSuffix);

        delta.text(function(d) {
            return deltaFormatText(deltaValue(d));
        });
    }

    // Resize numbers to fit within space and position
    var numbersbBox;
    numbers.attr('transform', function() {
        var m = opts.numbersScaler(numbers);
        var key = m[2];
        if(!(trace._numbersScale && trace._numbersScale.key === key)) {
            trace._numbersScale = {key: key, value: 1};
        }
        var scaleRatio = trace._numbersScale.value = Math.min(trace._numbersScale.value, m[0]);
        numbersbBox = m[1];
        var translateY;
        if(trace._isAngular) {
            // bottom-align
            translateY = numbersY - scaleRatio * numbersbBox.bottom;
        } else {
            // center-align
            translateY = numbersY - scaleRatio * (numbersbBox.top + numbersbBox.bottom) / 2;
        }

        // If no gauge, compute title position relative to numbers
        trace._numbersTop = scaleRatio * (numbersbBox.top) + translateY;
        // titleY = scaleRatio * (numbersbBox.top) + translateY - opts.titlePadding;

        return strTranslate(numbersX, translateY) + ' scale(' + scaleRatio + ')';
    });
}

// Apply fill, stroke, stroke-width to SVG shape
function styleShape(p) {
    p
        .style('fill', function(d) { return d.color;})
        .style('stroke', function(d) { return d.line.color;})
        .style('stroke-width', function(d) { return d.line.width;});
}

// Returns a tween for a transition’s "d" attribute, transitioning any selected
// arcs from their current angle to the specified new angle.
function arcTween(arc, endAngle, newAngle) {
    return function() {
        var interpolate = d3.interpolate(endAngle, newAngle);
        return function(t) {
            return arc.endAngle(interpolate(t))();
        };
    };
}

// mocks our axis
function mockAxis(gd, opts, zrange) {
    var fullLayout = gd._fullLayout;

    var axisIn = {
        type: 'linear',
        ticks: 'outside',
        range: zrange,
        tickmode: opts.tickmode,
        nticks: opts.nticks,
        tick0: opts.tick0,
        dtick: opts.dtick,
        tickvals: opts.tickvals,
        ticktext: opts.ticktext,
        ticklen: opts.ticklen,
        tickwidth: opts.tickwidth,
        tickcolor: opts.tickcolor,
        showticklabels: opts.showticklabels,
        tickfont: opts.tickfont,
        tickangle: opts.tickangle,
        tickformat: opts.tickformat,
        exponentformat: opts.exponentformat,
        separatethousands: opts.separatethousands,
        showexponent: opts.showexponent,
        showtickprefix: opts.showtickprefix,
        tickprefix: opts.tickprefix,
        showticksuffix: opts.showticksuffix,
        ticksuffix: opts.ticksuffix,
        title: opts.title,
        showline: true
    };

    var axisOut = {
        type: 'linear',
        _id: 'x' + opts._id
    };

    var axisOptions = {
        letter: 'x',
        font: fullLayout.font,
        noHover: true,
        noTickson: true
    };

    function coerce(attr, dflt) {
        return Lib.coerce(axisIn, axisOut, axisLayoutAttrs, attr, dflt);
    }

    handleAxisDefaults(axisIn, axisOut, coerce, axisOptions, fullLayout);
    handleAxisPositionDefaults(axisIn, axisOut, coerce, axisOptions);

    return axisOut;
}

function strTranslate(x, y) {
    return 'translate(' + x + ',' + y + ')';
}

function strRotate(angle) {
    return 'rotate(' + angle + ')';
}

function fitTextInsideBox(el, width, height) {
    // compute scaling ratio to have text fit within specified width and height
    var textBB = Drawing.bBox(el.node());
    var ratio = Math.min(width / textBB.width, height / textBB.height);
    return [ratio, textBB, width + 'x' + height];
}

function fitTextInsideCircle(el, radius) {
    // compute scaling ratio to have text fit within specified radius
    var textBB = Drawing.bBox(el.node());
    var elRadius = Math.sqrt((textBB.width / 2) * (textBB.width / 2) + textBB.height * textBB.height);
    var ratio = radius / elRadius;
    return [ratio, textBB, radius];
}

// Draw gauge's min and max in text
// var minText = gauge.selectAll('text.min').data(cd);
// minText.enter().append('text').classed('min', true);
// minText
//       .call(Drawing.font, trace.number.font)
//       .style('font-size', gaugeFontSize)
//       .attr({
//           x: - (innerRadius + radius) / 2,
//           y: gaugeFontSize,
//           'text-anchor': 'middle'
//       })
//       .text(fmt(trace.vmin));
//
// var maxText = gauge.selectAll('text.max').data(cd);
// maxText.enter().append('text').classed('max', true);
// maxText
//       .call(Drawing.font, trace.number.font)
//       .style('font-size', gaugeFontSize)
//       .attr({
//           x: (innerRadius + radius) / 2,
//           y: gaugeFontSize,
//           'text-anchor': 'middle'
//       })
//       .text(fmt(trace.vmax));
