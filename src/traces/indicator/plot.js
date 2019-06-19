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
        var titleAnchor = isBullet ? anchor.right : anchor[trace.title.align];
        var titlePadding = cn.titlePadding;

        // circular gauge
        var theta = Math.PI / 2;
        var radius = Math.min(size.w / 2, size.h); // fill domain
        var innerRadius = cn.innerRadius * radius;
        var gaugePosition = [0, 0];
        function valueToAngle(v) {
            var angle = (v - trace.vmin) / (trace.vmax - trace.vmin) * Math.PI - theta;
            if(angle < -theta) return -theta;
            if(angle > theta) return theta;
            return angle;
        }

        // bullet gauge
        var bulletHeight = size.h; // use all vertical domain

        // Position elements
        var titleX, titleY;
        var numbersX, numbersY, numbersScaler;
        var bignumberFontSize, bignumberY;
        var bignumberAlign = trace.align || 'center';
        var bignumberAnchor = anchor[bignumberAlign];
        var deltaFontSize;
        var deltaAnchor = bignumberAnchor;

        var centerX = size.l + size.w / 2;
        titleX = size.l + size.w * position[trace.title.align];
        numbersY = size.t + size.h / 2;

        if(!hasGauge) {
            numbersX = size.l + position[bignumberAlign] * size.w;
            numbersScaler = function(el) {
                return fitTextInsideBox(el, 0.9 * size.w, 0.9 * size.h);
            };
        } else {
            if(isAngular) {
                numbersX = centerX - 0.85 * innerRadius + 2 * 0.85 * innerRadius * position[bignumberAlign];
                numbersY = size.t + size.h / 2 + radius / 2;
                gaugePosition = [centerX, numbersY];

                numbersScaler = function(el) {
                    return fitTextInsideCircle(el, 0.9 * innerRadius);
                };
            }
            if(isBullet) {
                var padding = cn.bulletPadding;
                var p = (1 - cn.bulletNumberDomainSize) + padding;
                numbersX = size.l + (p + (1 - p) * position[bignumberAlign]) * size.w;
                titleX = size.l - padding * size.w; // Outside domain, on the left
                titleY = numbersY;

                numbersScaler = function(el) {
                    return fitTextInsideBox(el, (cn.bulletNumberDomainSize - padding) * size.w, size.h);
                };
            }
        }
        bignumberFontSize = trace.number.font.size;
        deltaFontSize = trace.delta.font.size;

        // Position delta relative to bignumber
        var deltaDy = 0;
        var deltaX = 0;
        if(hasDelta && hasBigNumber) {
            if(trace.delta.position === 'bottom') {
                // deltaDy = (bignumberFontSize / 2 + deltaFontSize / 2);
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

        // title
        var title = d3.select(this).selectAll('text.title').data(cd);
        title.enter().append('text').classed('title', true);
        title
            .attr({
                'text-anchor': titleAnchor,
            })
            .text(trace.title.text)
            .call(Drawing.font, trace.title.font)
            .call(svgTextUtils.convertToTspans, gd);
        title.exit().remove();

        // number indicators

        // bignumber
        var bignumberAx = mockAxis(gd, {tickformat: trace.valueformat});
        var fmt = function(v) { return Axes.tickText(bignumberAx, v).text;};
        var bignumberSuffix = trace.number.suffix;
        if(bignumberSuffix) bignumberSuffix = ' ' + bignumberSuffix;

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
        var numbers = d3.select(this).selectAll('text.numbers').data(cd);
        numbers.enter().append('text').classed('numbers', true);

        var data = [];
        var numberSpec = {
            'text-anchor': bignumberAnchor,
            class: 'number'
        };
        var deltaSpec = {
            'text-anchor': deltaAnchor,
            class: 'delta'
        };
        if(hasBigNumber) data.push(numberSpec);
        if(hasDelta) data.push(deltaSpec);
        if(trace.delta.position === 'left') data.reverse();
        var sel = numbers.selectAll('tspan').data(data);
        sel.enter().append('tspan');
        sel
                .attr('text-anchor', function(d) {return d['text-anchor'];})
                .attr('class', function(d) { return d.class;})
                .attr('dx', function(d, i) {
                    var pos = trace.delta.position;
                    // Add padding to the second tspan when it's a one-liner
                    if(i === 1 && (pos === 'left' || pos === 'right')) return 10;
                    return null;
                });
        sel.exit().remove();

        // bignumber
        var number = numbers.select('tspan.number');
        number
                .call(Drawing.font, trace.number.font)
                .attr('x', undefined)
                .attr('dy', bignumberY);

        // delta
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
            var m = numbersScaler(numbers);
            if(!(trace._numbersScale && trace._numbersScale.key === size.w + 'x' + size.h)) {
                trace._numbersScale = {key: size.w + 'x' + size.h, value: 1};
            }
            var scaleRatio = trace._numbersScale.value = Math.min(trace._numbersScale.value, m[0]);
            numbersbBox = m[1];
            var translateY;
            if(isAngular) {
                    // bottom-align
                translateY = numbersY - scaleRatio * numbersbBox.bottom;
            } else {
                    // center-align
                translateY = numbersY - scaleRatio * (numbersbBox.top + numbersbBox.bottom) / 2;
            }

                // If no gauge, compute title position relative to numbers
            titleY = scaleRatio * (numbersbBox.top) + translateY - titlePadding;

            return strTranslate(numbersX, translateY) + ' scale(' + scaleRatio + ')';
        });

        // Draw gauges
        if(hasGauge) {
            // Draw circular gauge
            data = cd.filter(function() {return isAngular;});
            var gauge = d3.select(this).selectAll('g.gauge').data(data);
            gauge.enter().append('g').classed('gauge', true);
            gauge.exit().remove();
            gauge.attr('transform', strTranslate(gaugePosition[0], gaugePosition[1]));

            function arcPathGenerator(size) {
                return d3.svg.arc()
                          .innerRadius((innerRadius + radius) / 2 - size / 2 * (radius - innerRadius))
                          .outerRadius((innerRadius + radius) / 2 + size / 2 * (radius - innerRadius))
                          .startAngle(-theta);
            }

            // Draw angular axis
            var ax;
            var opts = trace.gauge.axis;
            if(isAngular) {
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

                var shift;
                var _transFn = function(rad) {
                    return strTranslate(gaugePosition[0] + radius * Math.cos(rad), gaugePosition[1] - radius * Math.sin(rad));
                };
                var transFn = function(d) {
                    return _transFn(t2g(d));
                };
                var transFn2 = function(d) {
                    var rad = t2g(d);
                    return _transFn(rad) + strRotate(-rad2deg(rad));
                };

                var angularaxisLayer = d3.select(this).selectAll('g.angularaxis').data(data);
                angularaxisLayer.enter().append('g')
                      .classed('angularaxis', true)
                      .classed('crisp', true);
                angularaxisLayer.exit().remove();
                angularaxisLayer.selectAll('g.' + ax._id + 'tick,path').remove();

                var vals = Axes.calcTicks(ax);
                var tickSign;

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

                function drawArc(p) {
                    p
                            .attr('d', function(d) {
                                return arcPathGenerator(d.height)
                                  .startAngle(valueToAngle(d.range[0]))
                                  .endAngle(valueToAngle(d.range[1]))();
                            });
                }

                function styleShape(p) {
                    p
                            .style('fill', function(d) { return d.color;})
                            .style('stroke', function(d) { return d.line.color;})
                            .style('stroke-width', function(d) { return d.line.width;});
                }

                // Draw background + steps
                var arcs = [gaugeBg].concat(trace.gauge.steps);
                if(v) arcs.push(thresholdArc);
                var targetArc = gauge.selectAll('g.targetArc').data(arcs);
                targetArc.enter().append('g').classed('targetArc', true).append('path');
                targetArc.select('path').call(drawArc).call(styleShape);
                targetArc.exit().remove();

                    // Draw foreground with transition
                var valueArcPath = arcPathGenerator(trace.gauge.value.height);
                var fgArc = gauge.selectAll('g.fgArc').data([trace.gauge.value]);
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

                var gaugeBorder = gauge.selectAll('g.gaugeOutline').data([gaugeOutline]);
                gaugeBorder.enter().append('g').classed('gaugeOutline', true).append('path');
                gaugeBorder.select('path').call(drawArc).call(styleShape);
                gaugeBorder.exit().remove();
            }

            // Draw bullet
            var bulletLeft = domain.x[0];
            var bulletRight = domain.x[0] + (domain.x[1] - domain.x[0]) * ((hasBigNumber || hasDelta) ? (1 - cn.bulletNumberDomainSize) : 1);

            data = cd.filter(function() {return isBullet;});
            var innerBulletHeight = trace.gauge.value.height * bulletHeight;
            var bullet = d3.select(this).selectAll('g.bullet').data(data);
            bullet.enter().append('g').classed('bullet', true);
            bullet.exit().remove();
            bullet.attr('transform', 'translate(' + size.l + ', ' + size.t + ')');

            if(isBullet) {
                ax = mockAxis(gd, opts, range);
                ax.domain = [bulletLeft, bulletRight];
                ax.setScale();


                // Draw cartesian axis
                // force full redraw of labels and ticks
                var bulletaxis = d3.select(this).selectAll('g.bulletaxis').data(data);
                bulletaxis.enter().append('g')
                    .classed('bulletaxis', true)
                    .classed('crisp', true);
                bulletaxis.selectAll('g.' + ax._id + 'tick,path').remove();
                bulletaxis.exit().remove();

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

        // Position title
        title.attr('transform', function() {
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
                }
            }
            return strTranslate(titleX, titleY);
        });
    });
};

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
    return [ratio, textBB];
}

function fitTextInsideCircle(el, radius) {
    // compute scaling ratio to have text fit within specified radius
    var textBB = Drawing.bBox(el.node());
    var elRadius = Math.sqrt((textBB.width / 2) * (textBB.width / 2) + textBB.height * textBB.height);
    var ratio = radius / elRadius;
    return [ratio, textBB];
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
