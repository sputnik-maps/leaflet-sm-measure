/**
 * @title Measure tool Leaflet Control
 * @requires Leaflet.Editable
 * @author Max L Dolgov <bananafishbone@gmail.com>
 *
 *
 */
(function() {

/**
 *  dependencies check
 */
if (! L.Editable) {
	console && console.error && console.error('L.SmMeasure. Missing dependency: L.Editable');
	return;
}


L.SmMeasure = L.Control.extend({
	options: {
		position: 'topright',
		classList: 'leaflet-measure',
		tooltip: {
			closeTipClass: 'leaflet-measure-tooltip-close',
			removableClass: 'leaflet-measure-removable'
		},
		useBalloon: false,
		useLineDecor: false,
		shape: {
			color: '#000',
			weight: 2,
			opacity: .6
		},
		decor: {
			color: '#000',
			weight: 5,
			lineCap: 'butt',
			lineJoin: 'bevel', //'miter', 'round'
			dashArray: '1,9',
			opacity: .6
		}
	},


	addTo: function (map) {
		if (! this.options.bindControl) {
			L.Control.prototype.addTo.call(this, map);
			return this;
		}

		this._container = this.onAdd(map);
		return this;
	},

	/**
	 * when added to map: init dependency,
	 * control container creation
	 *
	 * @param map
	 * @returns {HTMLDivElement}
	 */
	onAdd: function (map) {
		this._map = map;

		if (! map.editTools) {
			map.whenReady(this.initEditable, this);
		}

		this.active = false;

		if (this.options.bindControl && this.options.elContainer && this.options.elButton) {
			this._container = this._bindControl(this.options.elContainer, this.options.elButton);
		} else {
			this._container = this._createControl();
		}

		return this._container;
	},

	/**
	 * clean data structures before start a measuring
	 */
	resetState: function () {
		/**
		 * @type {L.Editable.FORWARD | L.Editable.BACKWARD | 0 }
		 *
		 * is drawing mode active or not
		 */
		this.drawMode = 0;

		/**
		 * @type {L.Editable.FORWARD | L.Editable.BACKWARD }
		 *
		 * what drawing mode was the last
		 */
		this.lastDrawingMode = L.Editable.FORWARD;

		/**
		 * @type {boolean}
		 *
		 * user may set the tooltip on a non-edge vertex manually
		 * thus we have to keep its position until a drawing started
		 */
		this.stickyTooltip = false;

		/**
		 * for storing polyline vertexes
		 *
		 * @type {Array} <L.LatLng>
		 * @private
		 */
		this._vertexes = [];

		/**
		 * for storing tooltips, synchronized with this._vertexes
		 *
		 * @type {Array} <L.SmMeasure.Tooltip>
		 * @private
		 */
		this._vertexTooltips = [];
	},

	_addHooks: function () {
		this._map.on('viewreset', this.updateTooltip, this);

		this._map.on('editable:vertex:added', this.onVertexAdded, this);
		this._map.on('editable:vertex:drag', this.onVertexMoved, this);
		this._map.on('editable:vertex:deleted', this.onVertexDeleted, this);
		this._map.on('editable:vertex:click', this.onVertexClick, this);

		this._map.on('editable:editing', this.updateTooltip, this);
		this._map.on('mousemove', this.onMouseMove, this);

		this._map.on('editable:drawing:start', this.drawModeChanged, this);
		this._map.on('editable:drawing:commit', this.drawModeChanged, this);
		this._map.on('editable:drawing:end', this.drawModeChanged, this);
	},

	_removeHooks: function () {
		this._map.off('viewreset', this.updateTooltip, this);

		this._map.off('editable:vertex:added', this.onVertexAdded, this);
		this._map.off('editable:vertex:drag', this.onVertexMoved, this);
		this._map.off('editable:vertex:deleted', this.onVertexDeleted, this);
		this._map.off('editable:vertex:click', this.onVertexClick, this);

		this._map.off('editable:editing', this.updateTooltip, this);
		this._map.off('mousemove', this.onMouseMove);

		this._map.off('editable:drawing:start', this.drawModeChanged, this);
		this._map.off('editable:drawing:commit', this.drawModeChanged, this);
		this._map.off('editable:drawing:end', this.drawModeChanged, this);
	},

	/**
	 * onclick handler for a Control Button
	 *
	 * @param e DOMEvent
	 */
	onBtnClick: function (e) {
		this.toggle();
	},

	/**
	 * Toggles the measuring on/off
	 *
	 * @param state {boolean}	forces the state if exists
	 */
	toggle: function (state) {
		this.active = ! this.active;
		if ('undefined' !== typeof state) {
			this.active = !! state;
		}

		var markerPane = this._map.getPanes().markerPane;
		L.DomUtil.removeClass(markerPane, this.options.tooltip.removableClass);

		if (this.active) {
			L.DomUtil.addClass(this._button, 'active');

			this.line = this._map.editTools.startPolyline();
			if (this.options.shape) {
				this.line.setStyle(this.options.shape);
			}

			if (this.options.useLineDecor && this.options.decor) {
				this.lineDecor = this._map.editTools.createPolylineDecor([]);
				this.lineDecor.setStyle(this.options.decor);
				this._map.editTools.connectCreatedToMap(this.lineDecor);
				L.setOptions(this.line, {lineDecor: this.lineDecor});
			}

			this.resetState();
			this._addHooks();
		}
		else {
			L.DomUtil.removeClass(this._button, 'active');

			this._removeHooks();

			this._map.editTools.stopDrawing();
			//this._map.editTools.featuresLayer.clearLayers();
			//this._map.editTools.editLayer.clearLayers();
			this._map.removeLayer(this.line);

			this.resetTooltip();

			if (this._balloon) {
				this._balloon.innerHTML = '0 м';
			}

		}
	},

	/**
	 * Creates L-Control container and button inside
	 *
	 * @returns {HTMLDivElement}
	 * @private
	 */
	_createControl: function () {
		var container = L.DomUtil.create('div', 'leaflet-measure');
		this._toolbarContainer = L.DomUtil.create('div', 'leaflet-bar');
		this._button = this._createButton({
			title: 'Измерение расстояний',
			className: 'leaflet-measure-button',
			container: this._toolbarContainer,
			callback: this.onBtnClick
		});

		// Add draw and cancel containers to the control container
		container.appendChild(this._toolbarContainer);

		return container;
	},
	/**
	 * Binds existing DOM Elements as L-Control container and button
	 *
	 * @returns {HTMLDivElement}
	 * @private
	 */
	_bindControl: function (elContainer, elButton) {
		this._setButtonEvents(elButton);
		this._button = elButton;

		return elContainer;
	},

	/**
	 * Creates control's button
	 *
	 * @param options
	 * @returns {HTMLAnchorElement}
	 * @private
	 */
	_createButton: function (options) {
		var link = L.DomUtil.create('a', options.className || '', options.container);
		link.href = '#';

		if (options.text) {
			link.innerHTML = options.text;
		}
		if (options.title) {
			link.title = options.title;
		}
		this._setButtonEvents(link);

		return link;
	},

	_setButtonEvents: function (elButton) {
		L.DomEvent
			.on(elButton, 'click', L.DomEvent.stopPropagation)
			.on(elButton, 'mousedown', L.DomEvent.stopPropagation)
			.on(elButton, 'dblclick', L.DomEvent.stopPropagation)
			.on(elButton, 'click', L.DomEvent.preventDefault)
			.on(elButton, 'click', this.onBtnClick, this);
	},

	/**
	 * When a vertex clicked, we could draw forward, backward or set a tooltip
	 *
	 * @param e
	 */
	onVertexClick: function (e) {
		var index = e.vertex.getIndex(),
			isDrawing = (e.layer && e.layer.editor && e.layer.editor.drawing) || 0,
			vertexTooltip;

		if (isDrawing) {
			return;
		}

		this.resetTooltip();

		if (index === e.vertex.getLastIndex()) {
			this.stickyTooltip = false;
			e.layer.editor.continueForward();
			this.lastDrawingMode = this.line.editor.drawing;

			this.updateTooltip(e);
		}
		else if (index === 0) {
			this.stickyTooltip = false;
			e.layer.editor.continueBackward();
			this.lastDrawingMode = this.line.editor.drawing;

			this.updateTooltip(e);
		}
		else {
			this.stickyTooltip = true;
			vertexTooltip = this.getVertexTooltip(e.latlng, index);
			if (vertexTooltip) {
				this.updateVertexTooltip(vertexTooltip, null, index);
			}
			this._tooltip = vertexTooltip;
		}
	},

	/**
	 * when a vertex added we have to synchronize data structures
	 *
	 * @param e
	 */
	onVertexAdded: function (e) {
		this._vertexTooltips.splice(e.index, 0, null);
		this._vertexes.splice(e.index, 0, e.vertex);
	},

	/**
	 * when a vertex deleted we have to remove it's tooltip if one exists
	 * then synchronize data structures, check stickyTooltip validity
	 *
	 * @param e
	 */
	onVertexDeleted: function (e) {
		var tooltip = this._vertexTooltips[e.index];
		if (tooltip) {
			this.removeTooltip(tooltip);
			this._tooltip = null;
		}
		this._vertexTooltips.splice(e.index, 1);
		this._vertexes.splice(e.index, 1);

		if (this.stickyTooltip && this._vertexes.length === 2) {
			this.stickyTooltip = false;
		}
	},

	/**
	 * when a vertex moved we have to move it's tooltip too
	 *
	 * @param e
	 */
	onVertexMoved: function (e) {
		var latlng = e.vertex && e.vertex._latlng,
			index = e.vertex.getIndex(),
			tooltip = this._vertexTooltips[index];

		if (tooltip && latlng) {
			tooltip.setLatLng(latlng);
		}
	},

	/**
	 * when tooltip element clicked, make sure it's close-button,
	 * and if so, remove tooltip with its vertex. in case of 1 vertex stop measurung
	 *
	 * @param e
	 */
	onTooltipClicked: function (e) {
		L.DomEvent.stopPropagation(e);

		var target = e.originalEvent && e.originalEvent.target,
			xClicked = L.DomUtil.hasClass(target, this.options.tooltip.closeTipClass),
			hasTooltip = L.DomUtil.hasClass(e.target._icon, 'leaflet-measure-tooltip-marker'),
			index, vertex, coords;

		if (xClicked && hasTooltip) {
			index = this._vertexTooltips.indexOf(e.target);
			vertex = this._vertexes[index];
			coords = this.line.editor.getLatLngs();
			if (vertex) {
				if (coords.length > 2) {
					vertex['delete']();
					this.line.editor.refresh();
				}
				else {
					this.toggle(false);
				}
			}
		}
	},

	/**
	 * search and destroy the tooltip: from data structure and map
	 */
	resetTooltip: function () {
		if (! this._tooltip) {
			return;
		}

		var index = this._vertexTooltips.indexOf(this._tooltip);
		if (-1 !== index) {
			this._vertexTooltips[index] = null;
		}
		this.removeTooltip(this._tooltip);
		this._tooltip = null;
	},

	/**
	 * remove a tooltip from Leaflet layer
	 *
	 * @param tooltip
	 */
	removeTooltip: function (tooltip) {
		var hasLayer = this.line.editor.editLayer.hasLayer(tooltip);
		if (hasLayer) {
			tooltip.off('click', this.onTooltipClicked, this);
			this.line.editor.editLayer.removeLayer(tooltip);
		}
	},

	/**
	 * @param latlng
	 * @returns {L.SmMeasure.Tooltip}
	 * create a tooltip with latlng given
	 */
	createTooltip: function createTooltip(latlng) {
		var newVertexTooltip = L.SmMeasure.tooltip(latlng);
		newVertexTooltip.on('click', this.onTooltipClicked, this);
		this.line.editor.editLayer.addLayer(newVertexTooltip);

		return newVertexTooltip;
	},

	/**
	 * general tooltip for total distance
	 *
	 * @param latlng
	 * @returns {L.SmMeasure.Tooltip}
	 */
	getTooltip: function (latlng) {
		if (this._tooltip && this.stickyTooltip) {
			return this._tooltip;
		}

		if (! this._tooltip) {
			var index = this.line.editor.getLastDrawnIndex(this.lastDrawingMode);
			this._tooltip = this.getVertexTooltip(latlng, index);
		}
		else if (! this.stickyTooltip) {
			var sourceIndex = this._vertexTooltips.indexOf(this._tooltip),
				targetIndex = this.line.editor.getLastDrawnIndex(this.lastDrawingMode);
			if (sourceIndex !== targetIndex) {
				this._vertexTooltips[targetIndex] = this._tooltip;
				this._vertexTooltips[sourceIndex] = null;
			}
		}

		return this._tooltip;
	},

	/**
	 * tooltip for an ordinary vertex
	 *
	 * @param latlng
	 * @param index
	 * @returns {L.SmMeasure.Tooltip}
	 */
	getVertexTooltip: function (latlng, index) {
		if (! this._vertexTooltips[index]) {
			this._vertexTooltips[index] = this.createTooltip(latlng);
		}

		return this._vertexTooltips[index];
	},

	/**
	 * when drawing mode is changed, toggling a CSS-class on marker pane
	 *
	 * @param e
	 */
	drawModeChanged: function (e) {
		if (this.drawMode == this.line.editor.drawing) {
			return;
		}

		// drawMode changed here
		this.drawMode = this.line.editor.drawing;
		var pane = this._map.getPanes().markerPane;

		// only when drawing
		if (this.drawMode) {
			L.DomUtil.removeClass(pane, this.options.tooltip.removableClass);
		}
		else {
			L.DomUtil.addClass(pane, this.options.tooltip.removableClass);
		}
	},

	/**
	 * only for drawing mode, when user moves a mouse call to updateTooltip()
	 *
	 * @param e
	 */
	onMouseMove: function (e) {
		if (! this.line || ! this.line.editor) {
			return;
		}

		var latlngs = this.line.editor.getLatLngs(),
			isDrawing = this.line.editor.drawing;

		// drawing is on and starting point exists
		if (isDrawing && latlngs.length > 1) {
			this.updateTooltip(e);
		}
	},

	/**
	 * when shape geometry changes, get index of tooltip (`sticky` or `main`)
	 * picking guide-line distance if applicable, then call to this.updateVertexTooltip()
	 *
	 * @param e
	 */
	updateTooltip: function (e) {
		var index = (this.stickyTooltip && this._tooltip)
			? this._vertexTooltips.indexOf(this._tooltip)
			: this.line.editor.getLastDrawnIndex(this.lastDrawingMode);

		var latlngs = this.line.editor.getLatLngs(),
			latlng = latlngs[index],
			lineDistance = this.line.getDistance() || 0,
			guideDistance = (this.line.editor.drawing && latlng && e.latlng) ? latlng.distanceTo(e.latlng) : 0,
			tooltip = lineDistance + guideDistance ? this.getTooltip(latlng) : null;

		if (tooltip) {
			this.updateVertexTooltip(tooltip, latlng, index, lineDistance, guideDistance);
		}
	},

	/**
	 * sets a `tooltip` with `latlng` on vertex with `index`, with formatted label of `lineDistance`, `guideDistance` is used when passed in
	 *
	 * @param tooltip			SmMeasure.Tooltip
	 * @param latlng			coordinates of a tooltip
	 * @param index				among this._vertexTooltips
	 * @param lineDistance		number
	 * @param guideDistance		number		(optional)
	 */
	updateVertexTooltip: function (tooltip, latlng, index, lineDistance, guideDistance) {
		guideDistance = guideDistance || 0;
		lineDistance = 'number' == typeof lineDistance ? lineDistance : (this.line.getDistance() || 0);

		var sliceDistance = this.line.getDistance(index + 1) || 0,
			distance = this.lastDrawingMode === L.Editable.BACKWARD ? lineDistance - sliceDistance : sliceDistance,
			message = L.SmMeasure.formatDistance(distance + guideDistance);

		if (tooltip) {
			tooltip.setData(latlng, message);
		}

		if (this._balloon) {
			this._balloon.innerHTML = message;
		}
	},

	/**
	 * configures and run L.Editable
	 *
	 * @param map
	 */
	initEditable: function () {
		var map = this._map;

		map.options.editOptions = {
			lineGuideOptions: {
				dashArray: '1,10',
				weight: 2,
				color: '#000'
			}
		};

		map.options.editable = true;
		if (map.options.editable) {
			map.editTools = new L.Editable(map, map.options.editOptions);
		}
	}

});

// from services/SmFormatDistanceService
L.SmMeasure.formatDistance = function formatDistance(distance) {
	var formatted = (distance = + distance),
		unit = 'м';
	if (distance >= 10000) {
		formatted = Math.round(distance / 1000);
		unit = 'км';
	}
	else if (distance >= 950) {
		// Math.floor() better for `990` case resulting in `0.9` instead of `1` with Math.round()
		formatted = Math.floor(distance / 100) / 10; // for one floating point digit
		unit = 'км';
	}
	else if (distance > 500) {
		formatted = Math.round(distance / 50) * 50; // approximation for 50 meters
	}
	else if (distance > 95) {
		formatted = Math.round(distance / 5) * 5; // approximation for 5 meters
	}
	else {
		formatted = Math.round(distance);
	}

	return ('' + formatted).replace('.', ',') + ' ' + unit;
};

L.smMeasure = function (options) {
	return new L.SmMeasure(options);
};

/**
 * Tooltip for Measure
 */
L.SmMeasure.Tooltip = L.Marker.extend({
	options: {
		closeTipClass: 'leaflet-measure-tooltip-close'
	},

	initialize: function (latlng, options) {
		options = options || {};
		L.setOptions(this, options);
		options.icon = options.icon || this._createIcon();

		L.Marker.prototype.initialize.call(this, new L.LatLng(latlng.lat, latlng.lng), options);
	},

	/**
	 * setting text data
	 *
	 * @param domain
	 */
	setInfo: function (domain) {
		this.setIcon(this._createIcon(domain));
	},

	/**
	 * setting location and text data
	 *
	 * @param latlng
	 * @param message
	 */
	setData: function (latlng, message) {
		if (latlng) {
			this.setLatLng(latlng);
		}
		if (message) {
			this.setInfo({text: message});
		}
	},

	/**
	 * generates a DivIcon for a Tooltip
	 *
	 * @param domain e.g. {text: "text label"}
	 * @returns {L.DivIcon}
	 * @private
	 */
	_createIcon: function (domain) {
		var closeTip = this.options.closeTipClass ? '<i class="' + this.options.closeTipClass + '"></i>' : '';
		var tpl = '<div class="leaflet-draw-tooltip leaflet-measure-tooltip"' +
			'<span>{ text }' + closeTip + '</span></div>';

		var html = L.Util.template(tpl, domain || {text: ''});

		var icon = L.divIcon({
			className: 'leaflet-measure-tooltip-marker',
			iconSize: [0, 0],
			iconAnchor: [6, -6],
			html: html
		});

		return icon;
	}
});

L.SmMeasure.tooltip = function (latlng, options) {
	return new L.SmMeasure.Tooltip(latlng, options);
};

/**
 * custom size of VertexIcon
 */
L.Editable.VertexIcon = L.DivIcon.extend({
	options: {
		iconSize: new L.Point(10, 10)
	}
});

L.Editable.VertexMarker.include({
	/**
	 * sends deleted vertex index in event message,
	 * that become unavailable via e.vertex.getIndex() since in deleted
	*/
	'delete': function () {
		var next = this.getNext();  // Compute before changing latlng
		var index = this.latlngs.indexOf(this.latlng);
		this.latlngs.splice(index, 1);
		this.editor.editLayer.removeLayer(this);
		this.editor.onVertexDeleted({latlng: this.latlng, vertex: this, index: index});
		if (next) next.resetMiddleMarker();
	}
});

L.Editable.SmVertexMarker = L.Editable.VertexMarker.extend({
	onAdd: function (map) {
		L.Editable.VertexMarker.prototype.onAdd.call(this, map);
		this._map = map;
		this.clickTriggered = 0;
	},

	/**
	 * when 2 clicks in a `period` registered
	 * produces pseudo `double-click`
	 * otherwise treated as `click`
	 *
	 * @param e
	 */
	onClick: function (e) {
		e.vertex = this;
		var _this = this,
			period = 200;

		if (! this.clickTriggered) {
			setTimeout(function () {
				if (! _this.editor.drawing && _this.clickTriggered > 1) {
					_this.editor.onVertexMarkerDblClick(e);
				}
				else {
					_this.editor.onVertexMarkerClick(e);
				}
				_this.clickTriggered = 0;
			}, period);
		}
		this.clickTriggered ++;
	}

});

L.Editable.MiddleMarker.include({
	/**
	 * onMouseDown handler
	 * sends extra data in `editable:vertex:added` event {index: indexAmongVertexes, vertex: MiddleMarker}
	 *
	 * @param e
	 */
	onMouseDown: function (e) {
		this.editor.onMiddleMarkerMouseDown(e, this);
		var index = this.index();
		this.latlngs.splice(index, 0, e.latlng);
		var marker = this.editor.addVertexMarker(e.latlng, this.latlngs);
		marker.dragging._draggable._onDown(e.originalEvent);  // Transfer ongoing dragging to real marker
		this.editor.onVertexAdded(L.extend({index: index, vertex: marker}, e));
		this.editor.refresh();
		this['delete']();
	}
});


L.Editable.mergeOptions({
	vertexMarkerClass: L.Editable.SmVertexMarker
});

L.Editable.include({
	createPolylineDecor: function createPolylineDecor (latlngs) {
		return new this.options.polylineClass(latlngs);
	}
});

L.Editable.PolylineEditor.include({
	getLastDrawnLatLng: function getLastDrawnLatLng (lastDrawingMode) {
		return this.getLatLngs()[this.getLastDrawnIndex(lastDrawingMode)];
	},

	getLastDrawnIndex: function getLastDrawnIndex (lastDrawingMode) {
		return lastDrawingMode === L.Editable.BACKWARD ? 0 : this.getLatLngs().length - 1;
	},

	onVertexMarkerClick: function (e) {
		var index = e.vertex.getIndex();

		if (index >= 1 && index === e.vertex.getLastIndex() && this.drawing === L.Editable.FORWARD && this._drawnLatLngs.length >= this.MIN_VERTEX) {
			this.commitDrawing();
		} else if (index === 0 && this.drawing === L.Editable.BACKWARD && this._drawnLatLngs.length >= this.MIN_VERTEX) {
			this.commitDrawing();
		} else {
			this.fireAndForward('editable:vertex:click', e);
		}
	}
});

L.Editable.PathEditor.include({
	/**
	 * adds a vertex to a shape,
	 * sends extra data in `editable:vertex:added` event {index: indexAmongVertexes, vertex: VertexMarker}
	 *
	 * @param latlng
	 */
	addLatLng: function (latlng) {
		if (this.drawing === L.Editable.FORWARD) this._drawnLatLngs.push(latlng);
		else this._drawnLatLngs.unshift(latlng);

		var index = this._drawnLatLngs.indexOf(latlng),
			vertex = this.addVertexMarker(latlng, this._drawnLatLngs);
		this.onVertexAdded({index: index, vertex: vertex});

		this.refresh();
	},

	/**
	 * redraw a main shape with its decor shape if one exists
	 */
	refresh: function () {
		if (this.feature.options.lineDecor) {
			this.feature.options.lineDecor.setLatLngs(this.feature.getLatLngs());
		}

		this.feature.redraw();
		this.onEditing();
	},

	/**
	 * adds a custom event when vertex is added
	 * @param e
	 */
	onVertexAdded: function (e) {
		this.fireAndForward('editable:vertex:added', e);
	},

	/**
	 * double click triggers a vertex deletion
	 *
	 * @param e
	 */
	onVertexMarkerDblClick: function (e) {
		this.onVertexRawMarkerClick(e);
	}

});

L.Polyline.include({
	getDistance: function (latLngsCount) {
		var distance = 0,
			latLngs = this._latlngs,
			latLng, prevLatLng;
		latLngsCount = latLngsCount || latLngs.length;

		for (var i = 1; i < latLngsCount; i++) {
			prevLatLng = latLngs[i - 1];

			latLng = latLngs[i];

			if (latLng instanceof L.LatLng) {
				distance += latLng.distanceTo(prevLatLng);
			}
		}
		return distance;
	}
});

})();
