(() => {
  "use strict";

  mapboxgl.accessToken =
    "pk.eyJ1IjoieWV5YWw5NDciLCJhIjoiY21oeHFvNm1kMDRqbjJxcHQ1d2FwYjR6aSJ9.YuBSqR795plFdjL6zIBVLg";

  const dataPath = "mapbox_geojson/";

  const labelTranslations = {
    "Religioso / devocional": "Religious / Devotional",
    "Próceres nacionales y símbolos patrios": "National Heroes and Patriotic Symbols",
    "Culturas latinoamericanas vecinas": "Neighboring Latin American Cultures",
    "Herencia europea (italiana)": "Italian Heritage",
    "Herencia europea (francesa)": "French Heritage",
    "Herencia europea (española)": "Spanish Heritage",
    "Herencia europea (otra)": "Other European Heritage",
    "Herencia judía": "Jewish Heritage",
    "New Age / self help": "New Age",
    "Personal / familiar": "Personal / Familiar",
    "Nostalgia rioplatense": "Río de la Plata Nostalgia",
    "Herencia asiática": "Asian Heritage",
    "Herencia de Medio Oriente": "Middle Eastern Heritage",
    "Folklore y cultura local argentina": "Argentine Folklore and Local Culture",
    "Nombres comunitarios / unión / popular": "Community Names",
    "Animales y naturaleza (neutral)": "Animals and Nature",
    "Literario / intelectual / artístico": "Artistic / Intellectual",
    "Anglophone": "Anglophone",
    "Sin motivo claro / nombre genérico": "No Clear Motive / Generic Name",
  };

  function translateLabel(label) {
    return labelTranslations[label] || label;
  }
  Promise.all([
    d3.json(dataPath + "barrios_map.geojson"),
    d3.json(dataPath + "comunas_map.geojson"),
    d3.csv(dataPath + "places.csv"),
    d3.json(dataPath + "motif_details.json"),
  ]).then(([barriosGeo, comunasGeo, placesRaw, motifDetails]) => {
    function cleanLabel(s) {
      return (s || "").normalize("NFKC").replace(/\s+/g, " ").trim();
    }

    const EXCLUDED_MOTIFS = new Set(["New Age / self help"]);

    const places = placesRaw
      .map((d) => {
        d.label_clean = cleanLabel(d.unified_label);
        d.value_clean = (d.value || "").normalize("NFKC").trim();
        return d;
      })
      .filter((d) => !EXCLUDED_MOTIFS.has(d.label_clean));
    const uniqueLabels = Array.from(
      new Set(places.map((d) => d.label_clean)),
    ).sort();

    const palette = [
      "#c4b090",
      "#88a8a0",
      "#c48878",
      "#8898c4",
      "#b08898",
      "#98a868",
      "#78a8b0",
      "#c8a868",
      "#988898",
      "#88b088",
      "#c09880",
      "#8098a8",
      "#a89870",
      "#9890b8",
      "#a08088",
    ];

    const labelColorScale = d3
      .scaleOrdinal()
      .domain(uniqueLabels)
      .range(palette.slice(0, uniqueLabels.length));
    function getDefaultView() {
      if (window.matchMedia("(max-width: 768px)").matches) {
        return { center: [-58.44, -34.62], zoom: 10.35 };
      }
      return { center: [-58.43, -34.611], zoom: 11.22 };
    }

    const DEFAULT_VIEW = getDefaultView();

    const map = new mapboxgl.Map({
      container: "map",
      style: "mapbox://styles/mapbox/dark-v11",
      center: DEFAULT_VIEW.center,
      zoom: DEFAULT_VIEW.zoom,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      scrollZoom: true,
    });

    const mapParent = document.getElementById("map");

    let currentView = "venues";

    const MAP = {
      land: "#111114",
      water: "#0c0c10",
      barrio: "rgba(255, 255, 255, 0.14)",
      comuna: "rgba(255, 255, 255, 0.28)",
      label: "#b4b4bc",
      labelOnDark: "#f4f4f6",
      labelOnLight: "#1c1c22",
      dotNeutral: "#c4c0b8",
      dotGhost: "#6a6660",
    };

    const LEGEND_WIDTH = 220;
    const LEGEND_PAD = 20;
    const LEGEND_PAD_BOTTOM = 14;
    const LEGEND_INNER_WIDTH = LEGEND_WIDTH - LEGEND_PAD * 2;

    const VIEW_SUBTITLES = {
      venues: "Each point is a venue. Hover over a point to see details.",
      comunas: "Each number is a comuna. Hover over a comuna to see details.",
    };
    const roadLayerIds = [];

    function isRoadLineLayer(id, type) {
      if (type !== "line") return false;
      if (
        id.includes("label") ||
        id.includes("path") ||
        id.includes("pedestrian") ||
        id.includes("waterway") ||
        id.includes("aeroway") ||
        id.includes("rail") ||
        id.includes("ferry") ||
        id.includes("cable")
      ) {
        return false;
      }
      return (
        id.startsWith("road-") ||
        id.startsWith("bridge-") ||
        id.startsWith("tunnel-")
      );
    }

    function roadStyleFor(id) {
      if (/motorway|trunk/.test(id)) {
        return { color: "#737380", opacity: 0.52, width: 0.32 };
      }
      if (/primary/.test(id)) {
        return { color: "#5c5c66", opacity: 0.46, width: 0.24 };
      }
      if (/secondary|tertiary/.test(id)) {
        return { color: "#4a4a54", opacity: 0.4, width: 0.18 };
      }
      if (/street|minor|link/.test(id)) {
        return { color: "#3a3a42", opacity: 0.36, width: 0.12 };
      }
      if (/service/.test(id)) {
        return { color: "#34343a", opacity: 0.3, width: 0.08 };
      }
      return { color: "#404048", opacity: 0.38, width: 0.14 };
    }

    function setupMapControls() {
      const controls = document.createElement("div");
      controls.className = "map-custom-controls";
      controls.innerHTML = `
        <div class="map-ctrl-shell">
          <button type="button" class="map-ctrl-btn" data-action="reset" title="Reset map view" aria-label="Reset map view">R</button>
        </div>
        <div class="map-ctrl-shell map-ctrl-shell--stack">
          <button type="button" class="map-ctrl-btn" data-action="zoom-in" title="Zoom in" aria-label="Zoom in">+</button>
          <button type="button" class="map-ctrl-btn" data-action="zoom-out" title="Zoom out" aria-label="Zoom out">−</button>
        </div>
      `;

      mapParent.appendChild(controls);

      controls.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-action]");
        if (!btn) return;

        if (btn.dataset.action === "reset") {
          const view = getDefaultView();
          map.flyTo({
            center: view.center,
            zoom: view.zoom,
            bearing: 0,
            pitch: 0,
            duration: 650,
          });
          return;
        }

        if (btn.dataset.action === "zoom-in") {
          map.zoomIn({ duration: 250 });
          return;
        }

        if (btn.dataset.action === "zoom-out") {
          map.zoomOut({ duration: 250 });
        }
      });
    }

    function motifTextColor(label) {
      const base = d3.rgb(labelColorScale(label));
      return d3.interpolateRgb(base, "#f2f2f5")(0.62);
    }

    function setMotifTitleColor(titleEl, label) {
      if (titleEl && label) {
        titleEl.style.color = motifTextColor(label);
      }
    }

    function styleRoadLineLayer(id) {
      const s = roadStyleFor(id);
      map.setPaintProperty(id, "line-color", s.color);
      map.setPaintProperty(id, "line-opacity", s.opacity);
      map.setPaintProperty(id, "line-width", s.width);
    }

    function setStreetLayerVisibility(view) {
      roadLayerIds.forEach((id) => {
        try {
          map.setLayoutProperty(
            id,
            "visibility",
            view === "venues" ? "visible" : "none",
          );
        } catch (e) {
          // ignore
        }
      });
    }
    let minimalBasemapApplied = false;

    function applyMinimalBasemap() {
      if (minimalBasemapApplied) return;

      const style = map.getStyle();
      if (!style || !style.layers) return;

      roadLayerIds.length = 0;

      style.layers.forEach((layer) => {
        const id = layer.id;
        const type = layer.type;

        try {
          if (type === "background") {
            map.setPaintProperty(id, "background-color", MAP.land);
            return;
          }

          if (
            type === "fill" &&
            id.includes("water") &&
            !id.includes("waterway")
          ) {
            map.setPaintProperty(id, "fill-color", MAP.water);
            map.setPaintProperty(id, "fill-opacity", 1);
            return;
          }

          if (type === "line" && id.includes("waterway")) {
            map.setPaintProperty(id, "line-color", MAP.water);
            map.setPaintProperty(id, "line-opacity", 0.9);
            return;
          }

          if (type === "fill" && (id === "land" || id.includes("national-park"))) {
            map.setPaintProperty(id, "fill-color", MAP.land);
            return;
          }

          if (isRoadLineLayer(id, type)) {
            styleRoadLineLayer(id);
            roadLayerIds.push(id);
            return;
          }

          map.setLayoutProperty(id, "visibility", "none");
        } catch (e) {
        }
      });

      setStreetLayerVisibility(currentView);
      minimalBasemapApplied = true;
    }

    map.on("style.load", applyMinimalBasemap);
    map.on("load", applyMinimalBasemap);
    setupMapControls();
    const svg = d3
      .select(mapParent)
      .append("svg")
      .style("position", "absolute")
      .style("top", "0")
      .style("left", "0")
      .style("z-index", "5")
      .style("pointer-events", "none")
      .style("overflow", "visible");
    function resizeSvg() {
      svg
        .attr("width", mapParent.clientWidth)
        .attr("height", mapParent.clientHeight);
    }

    resizeSvg();
    window.addEventListener("resize", resizeSvg);

    mapParent.addEventListener(
      "wheel",
      (event) => {
        const canvas = map.getCanvas();
        const svgRoot = svg.node();
        if (!canvas || !svgRoot || event.target === canvas) return;
        if (!svgRoot.contains(event.target)) return;

        canvas.dispatchEvent(
          new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
            clientX: event.clientX,
            clientY: event.clientY,
            deltaX: event.deltaX,
            deltaY: event.deltaY,
            deltaZ: event.deltaZ,
            deltaMode: event.deltaMode,
            ctrlKey: event.ctrlKey,
            shiftKey: event.shiftKey,
            altKey: event.altKey,
            metaKey: event.metaKey,
          }),
        );
      },
      { capture: true, passive: true },
    );

    function projectPoint(lon, lat) {
      const point = map.project([lon, lat]);
      this.stream.point(point.x, point.y);
    }
    const transform = d3.geoTransform({ point: projectPoint });
    const path = d3.geoPath().projection(transform);
    const tooltip = svg
      .append("g")
      .attr("id", "tooltip")
      .style("pointer-events", "none")
      .style("z-index", "100")
      .attr("opacity", 0);

    const TOOLTIP_PAD = 10;
    const TOOLTIP_MAX_WIDTH = 240;

    const tooltipBg = tooltip.append("rect").attr("class", "tooltip-bg");

    const tooltipForeignObject = tooltip
      .append("foreignObject")
      .attr("width", TOOLTIP_MAX_WIDTH)
      .attr("height", 1);

    const tooltipDiv = d3
      .select(tooltipForeignObject.node())
      .append("xhtml:div")
      .attr("class", "tooltip-content");
    function showTooltip(lines, x, y) {
      tooltipDiv.html(lines.join("<br>"));

      const divNode = tooltipDiv.node();
      const divHeight = divNode.offsetHeight;
      const divWidth = Math.min(divNode.offsetWidth, TOOLTIP_MAX_WIDTH);

      tooltipForeignObject.attr("width", divWidth).attr("height", divHeight);

      const tooltipWidth = divWidth + TOOLTIP_PAD * 2;
      const tooltipHeight = divHeight + TOOLTIP_PAD * 2;
      const canvasWidth = mapParent.clientWidth;
      const canvasHeight = mapParent.clientHeight;
      const offsetX = 18;
      const offsetY = -12;

      let tooltipX = x + offsetX;
      let tooltipY = y + offsetY;
      if (tooltipX + tooltipWidth > canvasWidth) {
        tooltipX = x - tooltipWidth - offsetX;
      }
      if (tooltipY + tooltipHeight > canvasHeight) {
        tooltipY = y - tooltipHeight - offsetY;
      }
      if (tooltipX < 0) tooltipX = offsetX;
      if (tooltipY < 0) tooltipY = offsetY;

      tooltipBg
        .attr("x", -TOOLTIP_PAD)
        .attr("y", -TOOLTIP_PAD)
        .attr("width", tooltipWidth)
        .attr("height", tooltipHeight);

      tooltipForeignObject.attr("x", 0).attr("y", 0);

      tooltip
        .attr("transform", `translate(${tooltipX}, ${tooltipY})`)
        .attr("opacity", 1)
        .raise();
    }
    function moveTooltip(x, y) {
      const divNode = tooltipDiv.node();
      const divHeight = divNode.offsetHeight;
      const divWidth = Math.min(divNode.offsetWidth, TOOLTIP_MAX_WIDTH);
      const tooltipWidth = divWidth + TOOLTIP_PAD * 2;
      const tooltipHeight = divHeight + TOOLTIP_PAD * 2;
      const canvasWidth = mapParent.clientWidth;
      const canvasHeight = mapParent.clientHeight;
      const offsetX = 18;
      const offsetY = -12;

      let tooltipX = x + offsetX;
      let tooltipY = y + offsetY;

      if (tooltipX + tooltipWidth > canvasWidth) {
        tooltipX = x - tooltipWidth - offsetX;
      }
      if (tooltipY + tooltipHeight > canvasHeight) {
        tooltipY = y - tooltipHeight - offsetY;
      }
      if (tooltipX < 0) tooltipX = offsetX;
      if (tooltipY < 0) tooltipY = offsetY;

      tooltip.attr("transform", `translate(${tooltipX}, ${tooltipY})`);
    }

    function hideTooltip() {
      tooltip.attr("opacity", 0);
    }
    const comunaShapes = svg
      .selectAll(".comuna")
      .data(comunasGeo.features)
      .join("path")
      .attr("class", "comuna")
      .attr("d", path)
      .attr("fill", "rgba(255, 255, 255, 0)")
      .attr("stroke", MAP.comuna)
      .attr("stroke-width", 0)
      .style("pointer-events", "none");
    const comunaLabels = svg
      .selectAll(".comuna-label")
      .data(comunasGeo.features)
      .join("text")
      .attr("class", "comuna-label")
      .attr("text-anchor", "middle")
      .attr("dy", ".35em")
      .attr("font-size", "17px")
      .attr("font-weight", "600")
      .attr("font-family", '"IBM Plex Sans", system-ui, sans-serif')
      .attr("fill", MAP.label)
      .attr("opacity", 0.85)
      .attr("pointer-events", "none")
      .text((d) => {
        const props = d.properties;
        const comunaName = props.comuna || props.name || props.Name || "";
        return comunaName.toString();
      })
      .attr("x", (d) => {
        const centroid = d3.geoCentroid(d);
        return map.project(centroid).x;
      })
      .attr("y", (d) => {
        const centroid = d3.geoCentroid(d);
        return map.project(centroid).y;
      });
    const featureBarrios = svg
      .selectAll(".barrio")
      .data(barriosGeo.features)
      .join("path")
      .attr("class", "barrio")
      .attr("d", path)
      .attr("stroke", MAP.barrio)
      .attr("stroke-width", 0.55)
      .attr("stroke-linejoin", "round")
      .attr("fill", "none")
      .style("pointer-events", "none");
    const barrioLabels = svg
      .selectAll(".barrio-label")
      .data(barriosGeo.features)
      .join("text")
      .attr("class", "barrio-label")
      .attr("text-anchor", "middle")
      .attr("dy", ".35em")
      .attr("font-size", "11px")
      .style("display", "none")
      .text((d) => (d.properties.nombre || "").toUpperCase())
      .attr("x", (d) => map.project(d3.geoCentroid(d)).x)
      .attr("y", (d) => map.project(d3.geoCentroid(d)).y);
    let committedMotif = null;
    let previewMotif = null;

    function formatBarrioName(s) {
      return (s || "")
        .toLowerCase()
        .replace(/(?:^|[\s(/])\w/g, (match) => match.toUpperCase());
    }

    function getDotFocus() {
      return previewMotif || committedMotif;
    }

    function isDotHighlighted(d) {
      const focus = getDotFocus();
      return !focus || d.label_clean === focus;
    }
    const placeDots = svg
      .selectAll(".place")
      .data(places)
      .join("circle")
      .attr("class", "place")
      .attr("r", 3.2)
      .attr("fill-opacity", 0.72)
      .attr("stroke", MAP.land)
      .attr("stroke-width", 0.45)
      .attr("stroke-opacity", 0.85)
      .style("pointer-events", (d) => (isDotHighlighted(d) ? "auto" : "none"))
      .on("mouseover", function (event, d) {
        if (currentView !== "venues") return;
        if (!isDotHighlighted(d)) return;

        const lines = [];
        if (d.name) lines.push(d.name);
        if (d.value_clean) lines.push(`Type: ${d.value_clean}`);
        if (d.barrio) lines.push(`Barrio: ${formatBarrioName(d.barrio)}`);
        lines.push(`Motif: ${translateLabel(d.label_clean)}`);

        const [x, y] = d3.pointer(event);
        showTooltip(lines, x, y);
      })
      .on("mouseout", hideTooltip)
      .on("mousemove", (event, d) => {
        if (currentView !== "venues") return;
        if (!isDotHighlighted(d)) return;
        const [x, y] = d3.pointer(event);
        moveTooltip(x, y);
      })
      .on("click", (event, d) => {
        event.stopPropagation();
        committedMotif = d.label_clean;
        previewMotif = null;
        
        updateLegend(d.label_clean);
        
        if (currentView === "venues") {
          updateDotAppearance();
          d3.select("#choropleth-legend").style("display", "none");
        }

        if (currentView === "comunas") {
          d3.select("#choropleth-legend").style("display", null);
          updateComunaAppearance();
          document
            .querySelector(".mapbox-container")
            .classList.add("motif-selected");
        }

        const translatedLabel = translateLabel(d.label_clean);
        const count = labelCounts[d.label_clean] || 0;
        const percent = Math.round((count / totalVenues) * 100);
        showMotifDetail(d.label_clean, translatedLabel, count, percent);
      });
    function updatePlaces() {
      placeDots
        .attr("cx", (d) => map.project([+d.lon, +d.lat]).x)
        .attr("cy", (d) => map.project([+d.lon, +d.lat]).y);
    }

    const PRIORITY_BARRIO_NAMES = new Set([
      "villa soldati",
      "villa lugano",
      "nuñez",
      "palermo",
      "la boca",
      "flores",
      "floresta",
      "villa pueyrredon",
      "chacarita",
      "puerto madero",
      "balvanera",
    ]);

    const WEST_PRIORITY_BARRIO_NAMES = new Set([
      "floresta",
      "villa pueyrredon",
    ]);

    function barrioLabelRank(feature) {
      const name = (feature.properties.nombre || "").toLowerCase();
      if (WEST_PRIORITY_BARRIO_NAMES.has(name)) return 0;
      if (PRIORITY_BARRIO_NAMES.has(name)) return 1;
      return 2;
    }

    function isPriorityBarrio(feature) {
      return barrioLabelRank(feature) < 2;
    }

    function maxBarrioLabelsForZoom(zoom) {
      if (zoom < 11.15) return 0;
      if (zoom < 11.35) return 18;
      if (zoom < 11.65) return 22;
      if (zoom < 12.1) return 28;
      if (zoom < 12.8) return 38;
      return Infinity;
    }

    function updateBarrioLabels() {
      const show =
        currentView === "venues" && committedMotif && !previewMotif;
      if (!show) {
        barrioLabels.style("display", "none");
        return;
      }

      const zoom = map.getZoom();
      const labelCap = maxBarrioLabelsForZoom(zoom);
      if (labelCap === 0) {
        barrioLabels.style("display", "none");
        return;
      }

      const fontSize = Math.max(9, Math.min(11, 8 + (zoom - 11) * 1.1));
      barrioLabels.attr("font-size", `${fontSize}px`);

      const placed = [];
      const pad = 4;
      const sorted = [...barriosGeo.features].sort((a, b) => {
        const ra = barrioLabelRank(a);
        const rb = barrioLabelRank(b);
        if (ra !== rb) return ra - rb;
        if (ra < 2) {
          const lonA = d3.geoCentroid(a)[0];
          const lonB = d3.geoCentroid(b)[0];
          if (lonA !== lonB) return lonA - lonB;
        }
        return (b.properties.area_metro || 0) - (a.properties.area_metro || 0);
      });

      const layout = new Map();

      function tryPlaceFeature(feature) {
        const id = feature.properties.id;
        const name = (feature.properties.nombre || "").toUpperCase();
        const pt = map.project(d3.geoCentroid(feature));
        const w = name.length * fontSize * 0.62;
        const h = fontSize + 4;
        const box = {
          x1: pt.x - w / 2 - pad,
          y1: pt.y - h / 2 - pad,
          x2: pt.x + w / 2 + pad,
          y2: pt.y + h / 2 + pad,
        };

        if (placed.length >= labelCap) {
          layout.set(id, { show: false });
          return;
        }

        const hit = placed.some(
          (p) =>
            !(box.x2 < p.x1 || box.x1 > p.x2 || box.y2 < p.y1 || box.y1 > p.y2),
        );

        if (!hit) {
          placed.push(box);
          layout.set(id, { x: pt.x, y: pt.y, name, show: true });
        } else {
          layout.set(id, { show: false });
        }
      }

      sorted
        .filter(isPriorityBarrio)
        .forEach((feature) => tryPlaceFeature(feature));

      sorted
        .filter((feature) => !isPriorityBarrio(feature))
        .forEach((feature) => tryPlaceFeature(feature));

      barrioLabels.each(function (feature) {
        const info = layout.get(feature.properties.id);
        const el = d3.select(this);
        if (info?.show) {
          el.style("display", null)
            .attr("x", info.x)
            .attr("y", info.y)
            .text(info.name);
        } else {
          el.style("display", "none");
        }
      });
    }

    function reorderDots(focus) {
      if (!focus) {
        placeDots.sort(null);
        return;
      }
      placeDots.sort((a, b) => {
        const aOnTop = a.label_clean === focus ? 1 : 0;
        const bOnTop = b.label_clean === focus ? 1 : 0;
        return aOnTop - bOnTop;
      });
    }
    function updateDotAppearance() {
      if (currentView === "comunas") {
        placeDots.style("display", "none");
        updateBarrioLabels();
        return;
      }

      placeDots.style("display", null);
      const focus = getDotFocus();

      if (!focus) {
        placeDots
          .attr("fill", MAP.dotNeutral)
          .attr("fill-opacity", 0.52)
          .style("opacity", 1)
          .style("pointer-events", "auto");
        reorderDots(null);
        updateBarrioLabels();
        document.querySelector(".mapbox-container")?.classList.remove("motif-selected");
        return;
      }

      placeDots
        .attr("fill", (d) =>
          d.label_clean === focus
            ? labelColorScale(d.label_clean)
            : MAP.dotGhost,
        )
        .attr("fill-opacity", (d) => (d.label_clean === focus ? 0.88 : 0.06))
        .style("opacity", 1)
        .style("pointer-events", (d) =>
          d.label_clean === focus ? "auto" : "none",
        );

      reorderDots(focus);

      updateBarrioLabels();
      document.querySelector(".mapbox-container")?.classList.toggle(
        "motif-selected",
        !!committedMotif && !previewMotif,
      );
    }

    function comunaLabelStyle(fillColor) {
      const rgb = d3.rgb(fillColor);
      const lum =
        (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
      return lum < 0.42 ? MAP.labelOnDark : MAP.labelOnLight;
    }

    function applyComunaLabelStyles(selection, colorFn) {
      selection
        .attr("fill", (feature) => comunaLabelStyle(colorFn(feature)))
        .attr("stroke", "none");
    }
    const motifMaxCache = {};

    function getMotifMaxPercentage(motifLabel) {
      if (motifMaxCache[motifLabel] !== undefined) {
        return motifMaxCache[motifLabel];
      }

      let maxPct = 0;
      comunasGeo.features.forEach((feature) => {
        const props = feature.properties;
        const motifCounts = props.motif_counts || {};
        const total = props.total_venues || 1;

        const count = motifCounts[motifLabel] || 0;
        const proportion = count / total;

        if (proportion > maxPct) {
          maxPct = proportion;
        }
      });
      if (maxPct === 0) maxPct = 1;

      motifMaxCache[motifLabel] = maxPct;
      return maxPct;
    }
    function getComunaMotifColor(feature, motifLabel, maxPct) {
      const props = feature.properties;
      const motifCounts = props.motif_counts || {};
      const total = props.total_venues || 1;

      const count = motifCounts[motifLabel] || 0;
      const proportion = count / total;

      if (proportion === 0) return MAP.land;

      const motifColor = labelColorScale(motifLabel);
      const normalizedProportion = proportion / maxPct;

      return d3.interpolate(MAP.land, motifColor)(normalizedProportion);
    }
    function updateComunaAppearance() {
      const selectedMotif = committedMotif;
      const maxPct = selectedMotif ? getMotifMaxPercentage(selectedMotif) : 1;

      comunaShapes
        .attr("fill", (feature) => {
          if (!selectedMotif) return "rgba(255, 255, 255, 0.1)";
          return getComunaMotifColor(feature, selectedMotif, maxPct);
        })
        .attr("stroke", MAP.comuna)
        .attr("stroke-width", 0.65)
        .style("pointer-events", "auto");

      if (!selectedMotif) {
        comunaLabels
          .attr("fill", MAP.label)
          .attr("stroke", "none");
        return;
      }

      applyComunaLabelStyles(comunaLabels, (feature) =>
        getComunaMotifColor(feature, selectedMotif, maxPct),
      );
    }
    function updateComunaAppearanceForMotif(motif) {
      const maxPct = getMotifMaxPercentage(motif);

      comunaShapes
        .attr("fill", (feature) => getComunaMotifColor(feature, motif, maxPct))
        .attr("stroke", MAP.comuna)
        .attr("stroke-width", 0.65)
        .style("pointer-events", "auto");

      applyComunaLabelStyles(comunaLabels, (feature) =>
        getComunaMotifColor(feature, motif, maxPct),
      );
    }

    function setBarrioVisibility(view) {
      featureBarrios.style("display", view === "venues" ? null : "none");
      setStreetLayerVisibility(view);
    }
    function wireToggleButtons() {
      document.querySelectorAll(".toggle-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          document
            .querySelectorAll(".toggle-btn")
            .forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          toggleView(btn.dataset.view);
        });
      });
    }

    function toggleView(view) {
      currentView = view;
      const mapboxContainer = document.querySelector(".mapbox-container");
      const sideSubtitleEl = document.querySelector(".side-subtitle");
      const isInMotifDetail = detailSection.style.display !== "none";

      if (view === "venues") {
        setBarrioVisibility("venues");
        updateDotAppearance();
        comunaShapes
          .attr("fill", "none")
          .attr("stroke", "none")
          .style("pointer-events", "none");
        comunaLabels.style("display", "none");
        d3.select("#choropleth-legend").style("display", "none");
        mapboxContainer.classList.remove("motif-selected");
        mapboxContainer.classList.remove("view-comunas");

        if (!isInMotifDetail && sideSubtitleEl) {
          sideSubtitleEl.textContent = VIEW_SUBTITLES.venues;
        }
      } else {
        setBarrioVisibility("comunas");
        mapboxContainer.classList.add("view-comunas");
        placeDots.style("display", "none");
        comunaLabels.style("display", null);

        const selectedMotif = committedMotif;

        if (selectedMotif) {
          d3.select("#choropleth-legend").style("display", null);
          updateComunaAppearance();
          mapboxContainer.classList.add("motif-selected");
        } else {
          d3.select("#choropleth-legend").style("display", "none");
          comunaShapes
            .attr("fill", "rgba(255, 255, 255, 0.01)") // nearly transparent but still captures mouse events
            .attr("stroke", MAP.comuna)
            .attr("stroke-width", 1)
            .style("pointer-events", "auto");

          comunaLabels.attr("fill", MAP.label).attr("stroke", "none");

          mapboxContainer.classList.remove("motif-selected");
        }

        if (!isInMotifDetail && sideSubtitleEl) {
          sideSubtitleEl.textContent = VIEW_SUBTITLES.comunas;
        }

        updateBarrioLabels();
      }
    }
    function showComunaTooltip(feature, x, y) {
      const lines = [];
      const props = feature.properties;

      lines.push(`Comuna ${props.comuna}`);

      const selectedMotif = committedMotif;
      if (selectedMotif) {
        const motifCounts = props.motif_counts || {};
        const count = motifCounts[selectedMotif] || 0;
        const total = props.total_venues || 0;

        if (total > 0) {
          const percentage = Math.round((count / total) * 100);
          const translatedMotif = translateLabel(selectedMotif);
          lines.push(
            `${translatedMotif} names: ${count} (${percentage}% of all venues in comuna)`,
          );
        }
      }

      lines.push("");
      lines.push("Comuna demographics:");

      if (
        props.income_rank !== undefined &&
        props.income_rank !== null &&
        !Number.isNaN(props.income_rank)
      ) {
        lines.push(`  Income rank: ${props.income_rank}º`);
      }

      if (props.edad_promedio !== undefined && props.edad_promedio !== null) {
        const avgAge = parseFloat(props.edad_promedio);
        if (!isNaN(avgAge)) {
          lines.push(`  Avg age: ${avgAge.toFixed(1)} years`);
        }
      }

      showTooltip(lines, x, y);
    }
    const labelCounts = {};
    places.forEach((d) => {
      const label = d.label_clean;
      labelCounts[label] = (labelCounts[label] || 0) + 1;
    });

    const totalVenues = places.length;
    const motifListEl = document.getElementById("motif-list");
    const listSection = document.getElementById("motif-panel-list");
    const detailSection = document.getElementById("motif-detail");
    const sideSubtitleEl = document.querySelector(".side-subtitle");

    if (motifListEl) {
      const MIN_VENUES_TO_SHOW = 20;

      const sortedLabels = uniqueLabels
        .filter((label) => (labelCounts[label] || 0) >= MIN_VENUES_TO_SHOW)
        .sort(
          (a, b) => (labelCounts[b] || 0) - (labelCounts[a] || 0),
        );

      sortedLabels.forEach((label) => {
        const count = labelCounts[label] || 0;
        const percent = Math.round((count / totalVenues) * 100);
        const color = labelColorScale(label);
        const translatedLabel = translateLabel(label);
        const li = document.createElement("li");
        li.className = "dashed-card";
        li.dataset.motif = label;
        li.innerHTML = `
          <div class="motif-card-row">
            <div class="motif-card-dot" style="background-color: ${color};"></div>
            <div class="motif-card-body">
              <div class="dashed-card-title">${translatedLabel}</div>
              <div class="dashed-card-stat">${percent}% of total venues</div>
            </div>
          </div>
        `;
        li.addEventListener("click", () => {
          committedMotif = label;
          previewMotif = null;
          
          updateLegend(label);
          updateDotAppearance();

          if (currentView === "comunas") {
            d3.select("#choropleth-legend").style("display", null);
            updateComunaAppearance();
            document
              .querySelector(".mapbox-container")
              .classList.add("motif-selected");
          } else {
            d3.select("#choropleth-legend").style("display", "none");
          }

          showMotifDetail(label, translatedLabel, count, percent);
        });
        li.addEventListener("mouseenter", () => {
          previewMotif = label;
          updateDotAppearance();

          if (currentView === "comunas") {
            updateComunaAppearanceForMotif(label);
            updateLegend(label);
            d3.select("#choropleth-legend").style("display", null);
          }
        });

        li.addEventListener("mouseleave", () => {
          previewMotif = null;
          updateDotAppearance();

          if (currentView === "comunas") {
            if (committedMotif) {
              updateComunaAppearance();
              d3.select("#choropleth-legend").style("display", null);
            } else {
              comunaShapes
                .attr("fill", "rgba(255, 255, 255, 0.01)")
                .attr("stroke", MAP.comuna)
                .attr("stroke-width", 1);
              d3.select("#choropleth-legend").style("display", "none");
              comunaLabels.attr("fill", MAP.label).attr("stroke", "none");
            }
          }
        });

        motifListEl.appendChild(li);
      });
    }
    function showMotifDetail(label, translatedLabel, count, percent) {
      const motif = motifDetails[label];

      if (!motif) {
        console.warn(`No motif details found for: ${label}`);
        return;
      }

      const topUnigrams = motif.top_unigrams
        .map(
          (u) =>
            `<code class="motif-tag">${u.word} (${u.count})</code>`,
        )
        .join(", ");

      let correlationHtml = "";
      if (motif.correlations) {
        const corr = motif.correlations;
        const insights = [];
        function describeCorrelation(r) {
          const absR = Math.abs(r);
          if (absR >= 0.7) return "very strong";
          if (absR >= 0.5) return "strong";
          if (absR >= 0.3) return "moderate";
          if (absR >= 0.1) return "weak";
          return null; // no meaningful correlation if |r| < 0.1
        }
        function getDirection(r, variable) {
          if (variable === "income") {
            return r > 0 ? "higher-income" : "lower-income";
          }
          if (variable === "age") {
            return r > 0 ? "older" : "younger";
          }
          return r > 0 ? "higher" : "lower";
        }
        const incomeCorr = corr.ipcf_promedio_pesos;
        const ageCorr = corr.edad_promedio_anios;

        const incomeStrength = describeCorrelation(incomeCorr);
        const ageStrength = describeCorrelation(ageCorr);

        if (incomeStrength && ageStrength) {
          const incomeDir = getDirection(incomeCorr, "income");
          const ageDir = getDirection(ageCorr, "age");
          insights.push(
            `${incomeStrength.charAt(0).toUpperCase() + incomeStrength.slice(1)} correlation with ${incomeDir} neighborhoods (r=${incomeCorr.toFixed(2)}) and ${ageStrength} correlation with ${ageDir} neighborhoods (r=${ageCorr.toFixed(2)})`,
          );
        } else if (incomeStrength) {
          const direction = getDirection(incomeCorr, "income");
          insights.push(
            `${incomeStrength.charAt(0).toUpperCase() + incomeStrength.slice(1)} correlation with ${direction} neighborhoods (r=${incomeCorr.toFixed(2)})`,
          );
        } else if (ageStrength) {
          const direction = getDirection(ageCorr, "age");
          insights.push(
            `${ageStrength.charAt(0).toUpperCase() + ageStrength.slice(1)} correlation with ${direction} neighborhoods (r=${ageCorr.toFixed(2)})`,
          );
        }

        if (insights.length === 0) {
          insights.push("No strong demographic correlations detected (|r| < 0.1)");
        }

        correlationHtml = `
          <div class="motif-section">
            <h4>Demographic Correlation</h4>
            <div class="correlation-insights">${insights.join(" ")}</div>
          </div>
        `;
      }
      const detailHtml = `
        <div class="profile-body">
          <div class="motif-section">
            <h4>Venues</h4>
            <div class="motif-section-data">${count} (≈${percent}% of all venues)</div>
          </div>

          <div class="motif-section">
            <h4>Top Words</h4>
            <div class="motif-tags">${topUnigrams || "<em>none</em>"}</div>
          </div>

          ${correlationHtml}
          
          <div class="methodology-note">
            Learn more about how this data was collected and analyzed on the <a href="methodology.html">Methodology</a> page.
          </div>
        </div>
      `;

      detailSection.innerHTML = detailHtml;
      listSection.style.display = "none";
      detailSection.style.display = "block";
      if (sideSubtitleEl && motif.description) {
        sideSubtitleEl.textContent = motif.description;
      }
      if (!document.querySelector(".panel-back-link")) {
        const panelHeader = document.querySelector(".side-panel-header");
        const titleRow = document.querySelector(".side-panel-title-row");

        const backBtn = document.createElement("button");
        backBtn.type = "button";
        backBtn.className = "panel-back-link hero-cta";
        backBtn.innerHTML = `<span class="cta-arrow" aria-hidden="true">←</span><span class="hero-cta-text">All motifs</span>`;

        const controlRow = document.createElement("div");
        controlRow.className = "side-panel-control-row";
        controlRow.appendChild(backBtn);

        const modeToggle = titleRow.querySelector(".view-toggle");
        if (modeToggle) {
          controlRow.appendChild(modeToggle);
        }

        titleRow.textContent = "";
        const newTitle = document.createElement("h2");
        newTitle.className = "side-title";
        newTitle.textContent = translatedLabel;
        setMotifTitleColor(newTitle, label);
        titleRow.appendChild(newTitle);

        panelHeader.insertBefore(controlRow, titleRow);
        backBtn.addEventListener("click", () => {
          committedMotif = null;
          previewMotif = null;
          updateDotAppearance();

          if (currentView === "comunas") {
            d3.select("#choropleth-legend").style("display", "none");
            comunaShapes
              .attr("fill", "rgba(255, 255, 255, 0.01)")
              .attr("stroke", MAP.comuna)
              .attr("stroke-width", 1)
              .style("pointer-events", "auto");
            comunaLabels.attr("fill", MAP.label).attr("stroke", "none");
            document
              .querySelector(".mapbox-container")
              .classList.remove("motif-selected");
          }

          detailSection.style.display = "none";
          listSection.style.display = "";

          const controlRowEl = document.querySelector(
            ".side-panel-control-row",
          );
          if (controlRowEl) {
            controlRowEl.remove();
          }

          titleRow.innerHTML = `
            <h2 class="side-title">Motif explorer</h2>
            <div class="view-toggle">
              <button class="toggle-btn ${
                currentView === "venues" ? "active" : ""
              }" data-view="venues">By Venues</button>
              <button class="toggle-btn ${
                currentView === "comunas" ? "active" : ""
              }" data-view="comunas">By Comunas</button>
            </div>
          `;
          wireToggleButtons();
          if (sideSubtitleEl) {
            sideSubtitleEl.textContent = VIEW_SUBTITLES[currentView];
          }
        });
      } else {
        const titleRow = document.querySelector(".side-panel-title-row");
        const titleEl = titleRow.querySelector(".side-title");
        if (titleEl) {
          titleEl.textContent = translatedLabel;
          setMotifTitleColor(titleEl, label);
        }
        if (sideSubtitleEl && motif.description) {
          sideSubtitleEl.textContent = motif.description;
        }
      }
    }

    const legendContainer = svg
      .append("g")
      .attr("id", "choropleth-legend")
      .attr("transform", "translate(20, 20)")
      .style("pointer-events", "none")
      .style("display", "none");

    const legendBg = legendContainer
      .append("rect")
      .attr("x", -LEGEND_PAD)
      .attr("y", -LEGEND_PAD)
      .attr("width", LEGEND_WIDTH)
      .attr("height", 80)
      .attr("fill", "rgba(12, 12, 14, 0.92)")
      .attr("stroke", "rgba(255, 255, 255, 0.1)")
      .attr("stroke-width", 1)
      .attr("rx", 0);
    const legendTitleFO = legendContainer
      .append("foreignObject")
      .attr("x", 0)
      .attr("y", 0)
      .attr("width", LEGEND_INNER_WIDTH)
      .attr("height", 22);

    legendTitleFO
      .append("xhtml:div")
      .attr("class", "choropleth-legend-title")
      .style("font-size", "11px")
      .style("font-weight", "600")
      .style("letter-spacing", "0.08em")
      .style("text-transform", "uppercase")
      .style("color", "#b4b4bc")
      .style("font-family", '"IBM Plex Sans", system-ui, sans-serif')
      .style("line-height", "1.4")
      .style("white-space", "nowrap")
      .text("Motif share per comuna");

    const legendItemsContainer = legendContainer
      .append("g")
      .attr("id", "legend-items");
    function updateLegend(motifLabel) {
      const maxPct = getMotifMaxPercentage(motifLabel);
      const motifColor = labelColorScale(motifLabel);

      legendItemsContainer.selectAll("*").remove();

      const rawStops = [
        0,
        0.25 * maxPct,
        0.5 * maxPct,
        0.75 * maxPct,
        maxPct,
      ];
      const uniqueStops = [];
      rawStops.forEach((stop) => {
        const rounded = Math.round(stop * 100) / 100;
        if (
          uniqueStops.length === 0 ||
          rounded !==
            Math.round(uniqueStops[uniqueStops.length - 1] * 100) / 100
        ) {
          uniqueStops.push(stop);
        }
      });
      const legendStops = uniqueStops.map((stop) => ({
        pct: stop,
        label: `${Math.round(stop * 100)}%`,
      }));

      const barX = 0;
      const barY = 24;
      const swatchHeight = 12;
      const labelY = barY + swatchHeight + 15;
      const legendHeight =
        LEGEND_PAD + labelY + 4 + LEGEND_PAD_BOTTOM;
      const innerWidth = LEGEND_INNER_WIDTH;
      const swatchWidth = innerWidth / legendStops.length;

      legendBg.attr("height", legendHeight).attr("width", LEGEND_WIDTH);

      legendStops.forEach((stop, i) => {
        const x = barX + i * swatchWidth;

        legendItemsContainer
          .append("rect")
          .attr("x", x)
          .attr("y", barY)
          .attr("width", swatchWidth)
          .attr("height", swatchHeight)
          .attr("rx", 0)
          .attr(
            "fill",
            d3.interpolate(MAP.land, motifColor)(stop.pct / maxPct),
          )
          .attr("stroke", "none");

        if (i > 0) {
          legendItemsContainer
            .append("line")
            .attr("x1", x)
            .attr("x2", x)
            .attr("y1", barY)
            .attr("y2", barY + swatchHeight)
            .attr("stroke", "rgba(255, 255, 255, 0.18)")
            .attr("stroke-width", 0.5);
        }

        legendItemsContainer
          .append("text")
          .attr("x", x + swatchWidth / 2)
          .attr("y", labelY)
          .attr("text-anchor", "middle")
          .attr("font-size", "12px")
          .attr("font-family", '"IBM Plex Sans", system-ui, sans-serif')
          .attr("fill", "#b4b4bc")
          .text(stop.label);
      });

      legendItemsContainer
        .append("rect")
        .attr("x", barX)
        .attr("y", barY)
        .attr("width", innerWidth)
        .attr("height", swatchHeight)
        .attr("fill", "none")
        .attr("stroke", "rgba(255, 255, 255, 0.12)")
        .attr("stroke-width", 0.5)
        .attr("rx", 0);
    }
    updateDotAppearance();
    toggleView("venues");
    wireToggleButtons();

    function update() {
      featureBarrios.attr("d", path);
      comunaShapes.attr("d", path);

      comunaLabels
        .attr("x", (d) => {
          const centroid = d3.geoCentroid(d);
          return map.project(centroid).x;
        })
        .attr("y", (d) => {
          const centroid = d3.geoCentroid(d);
          return map.project(centroid).y;
        });

      barrioLabels
        .attr("x", (d) => map.project(d3.geoCentroid(d)).x)
        .attr("y", (d) => map.project(d3.geoCentroid(d)).y);

      updatePlaces();
      updateBarrioLabels();
    }

    let syncFrame = null;
    function scheduleUpdate() {
      if (syncFrame !== null) return;
      syncFrame = requestAnimationFrame(() => {
        syncFrame = null;
        update();
      });
    }

    map.on("move", scheduleUpdate);
    map.on("zoom", scheduleUpdate);
    map.on("movestart", hideTooltip);
    map.on("moveend", update);
    map.on("resize", () => {
      resizeSvg();
      scheduleUpdate();
    });
    update();

    function setupComunaHover() {
      comunaShapes
        .on("mouseover", function (event, feature) {
          if (currentView !== "comunas") return;

          const [x, y] = d3.pointer(event);
          showComunaTooltip(feature, x, y);
          d3.select(this).attr("stroke-width", 2);
        })
        .on("mouseout", function () {
          hideTooltip();
          const defaultWidth = committedMotif ? 0.65 : 1;
          d3.select(this).attr("stroke-width", defaultWidth);
        })
        .on("mousemove", (event) => {
          if (currentView !== "comunas") return;
          const [x, y] = d3.pointer(event);
          moveTooltip(x, y);
        });
    }

    setupComunaHover();
  });
})();