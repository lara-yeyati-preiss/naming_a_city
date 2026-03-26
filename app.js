(() => {
  "use strict";

  mapboxgl.accessToken =
    "pk.eyJ1IjoieWV5YWw5NDciLCJhIjoiY21oeHFvNm1kMDRqbjJxcHQ1d2FwYjR6aSJ9.YuBSqR795plFdjL6zIBVLg";

  const dataPath = "mapbox_geojson/";

  // translation dictionary: maps spanish motif labels from the data to english labels for the ui
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

  // helper to translate motifs into english; falls back to the original label if no translation exists
  function translateLabel(label) {
    return labelTranslations[label] || label;
  }

  // load all required data files in parallel using Promise.all
  // this pulls in: barrio boundaries, comuna boundaries, venue points, and motif-level metadata
  Promise.all([
    d3.json(dataPath + "barrios_map.geojson"),
    d3.json(dataPath + "comunas_map.geojson"),
    d3.csv(dataPath + "places.csv"),
    d3.json(dataPath + "motif_details.json"),
  ]).then(([barriosGeo, comunasGeo, placesRaw, motifDetails]) => {

    // -----------------------------------------
    // normalization helpers
    // -----------------------------------------

    // cleanLabel: normalizes motif label strings by converting to NFKC form (handles accents consistently),
    // collapsing multiple spaces into one, and trimming leading/trailing whitespace
    function cleanLabel(s) {
      return (s || "").normalize("NFKC").replace(/\s+/g, " ").trim();
    }

    // cleanBarrio: normalizes neighborhood names by applying NFKC, collapsing spaces,
    // trimming, and uppercasing. this makes joins between csv attributes and geojson properties robust.
    function cleanBarrio(s) {
      return (s || "")
        .normalize("NFKC")
        .replace(/\s+/g, " ")
        .trim()
        .toUpperCase();
    }

    // -----------------------------------------
    // clean places
    // -----------------------------------------

    // normalize label, barrio, and type fields
    const places = placesRaw.map((d) => {
      d.label_clean = cleanLabel(d.unified_label);
      d.barrio_clean = cleanBarrio(d.barrio);
      d.value_clean = (d.value || "").normalize("NFKC").trim();
      return d;
    });

    // -----------------------------------------
    // unique motif labels & color scale
    // -----------------------------------------

    // extract unique motif labels from the filtered venue data and sort them
    // this serves as the domain of the categorical color scale
    const uniqueLabels = Array.from(
      new Set(places.map((d) => d.label_clean)),
    ).sort();

    const palette = [
      "#2b211f",
      "#4a3f35",
      "#6d5c4d",
      "#a68a64",
      "#355070",
      "#6d597a",
      "#b56576",
      "#6b705c",
      "#cb997e",
      "#7f5539",
      "#3d405b",
      "#1d3557",
      "#8d7b68",
      "#5f5449",
      "#a9928dff",
    ];

    const labelColorScale = d3
      .scaleOrdinal()
      .domain(uniqueLabels)
      .range(palette.slice(0, uniqueLabels.length));

    // -----------------------------------------
    // mapbox setup
    // -----------------------------------------

    // initialize mapbox map centered on buenos aires with a light basemap
    const map = new mapboxgl.Map({
      container: "map",
      style: "mapbox://styles/mapbox/light-v11",
      center: [-58.43, -34.6037], // center on buenos aires
      zoom: 11,
    });

    const mapParent = document.getElementById("map");

    // add standard zoom / rotation controls
    map.addControl(new mapboxgl.NavigationControl(), "top-right");

    // create an svg overlay that sits above the mapbox canvas to host custom D3 visual layers
    const svg = d3
      .select(mapParent)
      .append("svg")
      .style("position", "absolute")
      .style("top", "0")
      .style("left", "0")
      .style("z-index", "5")
      .style("pointer-events", "none")
      .style("overflow", "visible");

    // keep the svg dimensions in sync with the underlying map container
    function resizeSvg() {
      svg
        .attr("width", mapParent.clientWidth)
        .attr("height", mapParent.clientHeight);
    }

    resizeSvg();
    window.addEventListener("resize", resizeSvg);

    // custom D3 projection function that delegates to mapbox's projection
    // the function receives longitude/latitude and passes the projected x/y coordinates into the D3 stream
    function projectPoint(lon, lat) {
      const point = map.project([lon, lat]);
      this.stream.point(point.x, point.y);
    }

    // transform + path configure D3 to rely on mapbox for actual map projection
    const transform = d3.geoTransform({ point: projectPoint });
    const path = d3.geoPath().projection(transform);

    // -----------------------------------------
    // tooltip (background rect + html content)
    // -----------------------------------------

    // create a tooltip group with:
    //  - a background rectangle
    //  - a foreignObject that hosts html content
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

    // showTooltip: populates the html container with text, measures its size,
    // and positions the tooltip within the map bounds with a small offset
    function showTooltip(lines, x, y) {
      // render lines as html with <br> separators
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

      // keep tooltip within map bounds (right / bottom)
      if (tooltipX + tooltipWidth > canvasWidth) {
        tooltipX = x - tooltipWidth - offsetX;
      }
      if (tooltipY + tooltipHeight > canvasHeight) {
        tooltipY = y - tooltipHeight - offsetY;
      }

      // clamp to top / left so the tooltip never disappears off-screen
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

    // moveTooltip: repositions the tooltip while preserving boundary constraints
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

    // -----------------------------------------
    // barrios: subtle outlines (no interaction)
    // -----------------------------------------
    const featureBarrios = svg
      .selectAll(".barrio")
      .data(barriosGeo.features)
      .join("path")
      .attr("class", "barrio")
      .attr("d", path)
      .attr("stroke", "#d6d1d1ff")
      .attr("stroke-width", 0.5)
      .attr("fill", "none")
      .attr("fill-opacity", 0);

    // -----------------------------------------
    // comunas: polygons + labels
    // -----------------------------------------

    // draw comuna polygons that later become choropleth cells when a motif is selected
    // hover + click via separate handlers
    const comunaShapes = svg
      .selectAll(".comuna")
      .data(comunasGeo.features)
      .join("path")
      .attr("class", "comuna")
      .attr("d", path)
      .attr("fill", "rgba(255, 255, 255, 0)")
      .attr("stroke", "#c7c3b7")
      .attr("stroke-width", 0)
      .style("pointer-events", "auto")
      .style("cursor", "pointer");

    // label each comuna at its geographic centroid
    const comunaLabels = svg
      .selectAll(".comuna-label")
      .data(comunasGeo.features)
      .join("text")
      .attr("class", "comuna-label")
      .attr("text-anchor", "middle")
      .attr("dy", ".35em")
      .attr("font-size", "14px")
      .attr("font-weight", "700")
      .attr("font-family", '"Source Serif 4", "Georgia", "Palatino Linotype", "Book Antiqua", Garamond, "Times New Roman", serif')
      .attr("fill", "#343a33")
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

    // -----------------------------------------
    // filter state
    // -----------------------------------------

    // activeLabels stores which motifs are currently "on" in the visualization
    // currentView toggles between individual venues and aggregate comunas
    let activeLabels = new Set(uniqueLabels); // which motifs are visible
    let currentView = "venues"; // "venues" or "comunas"

    // -----------------------------------------
    // points: venue dots (colored by motif)
    // -----------------------------------------

    // draw one circle per venue and attach mouse interactions for tooltips and motif selection
    const placeDots = svg
      .selectAll(".place")
      .data(places)
      .join("circle")
      .attr("class", "place")
      .attr("r", 4)
      .attr("fill-opacity", 0.6)
      .style("pointer-events", "auto")
      .style("cursor", "pointer")
      .on("mouseover", function (event, d) {
        // only show venue tooltips in "by venues" view; in "by comunas" tooltips belong to comunas
        if (currentView !== "venues") return;

        const lines = [];
        if (d.name) lines.push(d.name);
        if (d.value_clean) lines.push(`Type: ${d.value_clean}`);
        lines.push(`Motif: ${translateLabel(d.label_clean)}`);
        if (d.COMUNA) lines.push(`Comuna: ${d.COMUNA}`);

        const [x, y] = d3.pointer(event);
        showTooltip(lines, x, y);
      })
      .on("mouseout", hideTooltip)
      .on("mousemove", (event) => {
        // keep tooltip tracking cursor while hovering a point in "by venues" view
        if (currentView !== "venues") return;
        const [x, y] = d3.pointer(event);
        moveTooltip(x, y);
      })
      .on("click", (event, d) => {
        // clicking a dot focuses the visualization on that specific motif
        event.stopPropagation();

        // update the active motif set so only this label is considered "selected"
        activeLabels = new Set([d.label_clean]);
        
        // update the choropleth legend to match the newly selected motif
        updateLegend(d.label_clean);
        
        // update dots in the venues view; in comunas view dots are hidden
        if (currentView === "venues") {
          updateDotAppearance();
          // hide legend in venues view; here the emphasis is on point-level distribution
          d3.select("#choropleth-legend").style("display", "none");
        }

        // if we are in "by comunas" view, update the choropleth and reveal the legend
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

    // updatePlaces: reproject all venue dots whenever the underlying map moves or zooms
    function updatePlaces() {
      placeDots
        .attr("cx", (d) => map.project([+d.lon, +d.lat]).x)
        .attr("cy", (d) => map.project([+d.lon, +d.lat]).y);
    }

    // updateDotAppearance: apply color and visibility rules based on currentView and activeLabels
    function updateDotAppearance() {
      // in comunas view, points are hidden so they do not compete with the choropleth
      if (currentView === "comunas") {
        placeDots.style("display", "none");
        return;
      }

      // in venues view, fill color is driven by the motif color scale,
      // and visibility depends on whether the motif is in the active set
      placeDots
        .attr("fill", (d) => labelColorScale(d.label_clean))
        .style("display", (d) =>
          activeLabels.has(d.label_clean) ? null : "none",
        );
    }

    // -----------------------------------------
    // choropleth: color comunas by motif percentage
    // -----------------------------------------

    // motifMaxCache stores, for each motif, the maximum proportion (0–1) of venues in any comuna
    // this allows us to normalize color intensity consistently across comuna polygons
    const motifMaxCache = {};

    function getMotifMaxPercentage(motifLabel) {
      if (motifMaxCache[motifLabel] !== undefined) {
        return motifMaxCache[motifLabel];
      }

      let maxPct = 0;

      // scan all comunas to find the highest share of venues belonging to this motif
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

      // avoid a zero denominator later on; if motif is absent everywhere, treat max as 1
      if (maxPct === 0) maxPct = 1;

      motifMaxCache[motifLabel] = maxPct;
      return maxPct;
    }

    // returns the fill color for a comuna given a motif and its max percentage
    function getComunaMotifColor(feature, motifLabel, maxPct) {
      const props = feature.properties;
      const motifCounts = props.motif_counts || {};
      const total = props.total_venues || 1;

      const count = motifCounts[motifLabel] || 0;
      const proportion = count / total;

      if (proportion === 0) return "#f5f3ee";

      const motifColor = labelColorScale(motifLabel);
      const normalizedProportion = proportion / maxPct;

      return d3.interpolate("#f5f3ee", motifColor)(normalizedProportion);
    }

    // updateComunaAppearance: applies choropleth colors and label colors based on the selected motif
    function updateComunaAppearance() {
      const selectedMotif = Array.from(activeLabels)[0] || null;
      const maxPct = selectedMotif ? getMotifMaxPercentage(selectedMotif) : 1;

      comunaShapes
        .attr("fill", (feature) => {
          if (!selectedMotif) return "rgba(255, 255, 255, 0.1)";
          return getComunaMotifColor(feature, selectedMotif, maxPct);
        })
        .attr("stroke", "#d4d0c5")
        .attr("stroke-width", 0.8)
        .style("pointer-events", "auto")
        .style("cursor", "pointer");

      // update label color based on background lightness so numbers remain legible
      comunaLabels.attr("fill", (feature) => {
        if (!selectedMotif) return "#343a33"; // default dark when no fill

        const color = getComunaMotifColor(feature, selectedMotif, maxPct);
        const lightness = d3.hsl(color).l;

        // if background is dark, use light text; otherwise use dark text
        return lightness < 0.55 ? "#fdfcf9" : "#343a33";
      });
    }

    // preview version for hovering motif cards in the list
    // this does not change selection state; it only provides a temporary choropleth preview
    function updateComunaAppearanceForMotif(motif) {
      const maxPct = getMotifMaxPercentage(motif);

      comunaShapes
        .attr("fill", (feature) => getComunaMotifColor(feature, motif, maxPct))
        .attr("stroke", "#d4d0c5")
        .attr("stroke-width", 0.8)
        .style("pointer-events", "auto")
        .style("cursor", "pointer");

      comunaLabels.attr("fill", (feature) => {
        const color = getComunaMotifColor(feature, motif, maxPct);
        const lightness = d3.hsl(color).l;
        return lightness < 0.55 ? "#fdfcf9" : "#343a33";
      });
    }

    // -----------------------------------------
    // view toggle: "by venues" vs "by comunas"
    // -----------------------------------------

    // toggleView switches the interface between a point-based view and an aggregate choropleth view
    // it also updates explanatory text so that the side panel reflects the active mode
    function toggleView(view) {
      currentView = view;
      const mapboxContainer = document.querySelector(".mapbox-container");
      const sideSubtitleEl = document.querySelector(".side-subtitle");
      const sideSectionSubtitleEl = document.querySelector(".side-section-subtitle");
      
      // check if we're in motif detail view; in that case we avoid overwriting the description text
      const isInMotifDetail = detailSection.style.display !== "none";

      if (view === "venues") {
        // venues view: emphasize individual points colored by motif, hide choropleth
        updateDotAppearance();
        comunaShapes
          .attr("fill", "none")
          .attr("stroke", "none")
          .style("pointer-events", "none");
        comunaLabels.style("display", "none");
        d3.select("#choropleth-legend").style("display", "none");
        mapboxContainer.classList.remove("motif-selected");

        // only update subtitle text if not in motif detail view
        if (!isInMotifDetail) {
          if (sideSubtitleEl) {
            sideSubtitleEl.textContent = "Each point is a venue. Colors encode naming motifs. Hover any point to see that venue information.";
          }
          if (sideSectionSubtitleEl) {
            sideSectionSubtitleEl.textContent = "Select a motif to filter venues in the map.";
          }
        }
      } else {
        // comunas view: emphasize aggregate distributions by comuna and show labels
        placeDots.style("display", "none");

        // always show comuna labels in this view
        comunaLabels.style("display", null);

        const selectedMotif = Array.from(activeLabels)[0] || null;

        if (selectedMotif && activeLabels.size === 1) {
          // single motif selected: show choropleth and adjust label colors by background
          d3.select("#choropleth-legend").style("display", null);
          updateComunaAppearance();
          mapboxContainer.classList.add("motif-selected");
        } else {
          // no motif selected: show only outlines and labels; hover reveals demographic tooltip
          d3.select("#choropleth-legend").style("display", "none");
          comunaShapes
            .attr("fill", "rgba(255, 255, 255, 0.01)") // nearly transparent but still captures mouse events
            .attr("stroke", "#d4d0c5")
            .attr("stroke-width", 1.5) // thicker stroke when no motif selected
            .style("pointer-events", "auto")
            .style("cursor", "pointer");

          // reset all labels to a uniform dark color
          comunaLabels.attr("fill", "#343a33");

          mapboxContainer.classList.remove("motif-selected");
        }

        // only update subtitle text if not in motif detail view
        if (!isInMotifDetail) {
          if (sideSubtitleEl) {
            sideSubtitleEl.textContent = "Each number is a comuna. Hover any comuna to see that comuna information.";
          }
          if (sideSectionSubtitleEl) {
            sideSectionSubtitleEl.textContent = "Select a motif to see that motif's prominence by comuna in the map.";
          }
        }
      }
    }

    // -----------------------------------------
    // comuna tooltip
    // -----------------------------------------

    // showComunaTooltip assembles for each comuna:
    //  - comuna number
    //  - share and count of the selected motif (if exactly one is active)
    //  - basic demographic indicators (income rank, average age)
    function showComunaTooltip(feature, x, y) {
      const lines = [];
      const props = feature.properties;

      lines.push(`Comuna ${props.comuna}`);

      // show motif distribution if exactly one motif is selected
      const selectedMotif = Array.from(activeLabels)[0] || null;
      if (selectedMotif && activeLabels.size === 1) {
        const motifCounts = props.motif_counts || {};
        const count = motifCounts[selectedMotif] || 0;
        const total = props.total_venues || 0;

        if (total > 0) {
          const percentage = Math.round((count / total) * 100);
          const translatedMotif = translateLabel(selectedMotif);
          lines.push(
            `<strong>${translatedMotif} names: ${count} </strong> <br>(${percentage}% of all venues in comuna)`,
          );
        }
      }

      // always show a short demographics section for context
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

    // -----------------------------------------
    // label counts (for side-panel and stats)
    // -----------------------------------------

    // labelCounts tracks how many venues belong to each motif
    // this is used to populate the side list and compute percentages
    const labelCounts = {};
    places.forEach((d) => {
      const label = d.label_clean;
      labelCounts[label] = (labelCounts[label] || 0) + 1;
    });

    const totalVenues = places.length;

    // -----------------------------------------
    // panel integration
    // -----------------------------------------

    const motifListEl = document.getElementById("motif-list");
    const listSection = document.getElementById("motif-panel-list");
    const detailSection = document.getElementById("motif-detail");
    const sideNoteEl = document.querySelector(".side-note");

    if (motifListEl) {
      // only show motifs that appear at least a minimum number of times
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

        // each motif is rendered as a "dashed-card" with a colored dot and basic stats
        const li = document.createElement("li");
        li.className = "dashed-card";
        li.dataset.motif = label;
        li.innerHTML = `
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="
              width: 16px;
              height: 16px;
              border-radius: 50%;
              background-color: ${color};
              flex-shrink: 0;
            "></div>
            <div style="flex: 1;">
              <div class="dashed-card-title">${translatedLabel} — ${count} venues</div>
              <div class="dashed-card-meta">${percent}% of venues</div>
            </div>
          </div>
        `;

        // clicking a motif card:
        //  - filters the map to that motif
        //  - updates legend (if in comunas view)
        //  - opens a panel with more detailed stats
        li.addEventListener("click", () => {
          // filter map to just this motif
          activeLabels = new Set([label]);
          
          // update the choropleth legend to reflect this motif
          updateLegend(label);
          
          updateDotAppearance();

          if (currentView === "comunas") {
            d3.select("#choropleth-legend").style("display", null);
            updateComunaAppearance();
            document
              .querySelector(".mapbox-container")
              .classList.add("motif-selected");
          } else {
            // hide legend in venues view
            d3.select("#choropleth-legend").style("display", "none");
          }

          showMotifDetail(label, translatedLabel, count, percent);
        });

        // hovering over a motif card:
        //  - brightens dots for that motif
        //  - optionally previews the choropleth if in comunas view
        li.addEventListener("mouseenter", () => {
          // fade other motifs in the dot layer
          placeDots.style("opacity", (d) =>
            d.label_clean === label ? 1 : 0.15,
          );

          // choropleth preview when in "by comunas" view
          if (currentView === "comunas") {
            updateComunaAppearanceForMotif(label);
            updateLegend(label);
            d3.select("#choropleth-legend").style("display", null);
          }
        });

        // leaving the card restores opacity and either resets or restores the choropleth
        li.addEventListener("mouseleave", () => {
          // restore opacity based on activeLabels
          placeDots.style("opacity", (d) =>
            activeLabels.has(d.label_clean) ? 0.6 : 0,
          );

          if (currentView === "comunas") {
            const selectedMotif = Array.from(activeLabels)[0] || null;
            if (selectedMotif && activeLabels.size === 1) {
              updateComunaAppearance();
              d3.select("#choropleth-legend").style("display", null);
            } else {
              comunaShapes
                .attr("fill", "rgba(255, 255, 255, 0.01)") // nearly transparent but still captures mouse events
                .attr("stroke", "#d4d0c5")
                .attr("stroke-width", 1.5); // thicker stroke when no motif selected
              d3.select("#choropleth-legend").style("display", "none");

              // when no motif is selected, all labels go back to dark gray
              comunaLabels.attr("fill", "#343a33");
            }
          }
        });

        motifListEl.appendChild(li);
      });
    }

    // references to panel subtitle elements
    const sideSubtitleEl = document.querySelector(".side-subtitle");
    const sideSectionSubtitleEl = document.querySelector(".side-section-subtitle");

    // showMotifDetail: fills the right-hand panel with motif-specific information
    // including tf-idf keywords and correlation summaries with demographic variables
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

        // describeCorrelation: classifies correlation magnitude into qualitative bands
        function describeCorrelation(r) {
          const absR = Math.abs(r);
          if (absR >= 0.7) return "very strong";
          if (absR >= 0.5) return "strong";
          if (absR >= 0.3) return "moderate";
          if (absR >= 0.1) return "weak";
          return null; // no meaningful correlation if |r| < 0.1
        }

        // getDirection: converts sign into an interpretable direction (higher/lower income, older/younger, etc.)
        function getDirection(r, variable) {
          if (variable === "income") {
            return r > 0 ? "higher-income" : "lower-income";
          }
          if (variable === "age") {
            return r > 0 ? "older" : "younger";
          }
          return r > 0 ? "higher" : "lower";
        }

        // use the keys from motif_details.json (precomputed correlations per comuna)
        const incomeCorr = corr.ipcf_promedio_pesos;
        const ageCorr = corr.edad_promedio_anios;
        const elderlyCorr = corr.porc_65mas;

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

      // build the html content for the detail view: counts, keywords, correlations, and a short methodology note
      const detailHtml = `
        <div class="profile-body">
          <p><strong>Venues:</strong> ${count} (≈${percent}% of all venues)</p>

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

      // when a motif is selected, replace the generic subtitle with the motif's narrative description
      const sideSubtitleEl = document.querySelector(".side-subtitle");
      if (sideSubtitleEl && motif.description) {
        sideSubtitleEl.textContent = motif.description;
      }

      // restructure header to include a back button the first time we enter detail mode
      if (!document.querySelector(".panel-back-link")) {
        const panelHeader = document.querySelector(".side-panel-header");
        const titleRow = document.querySelector(".side-panel-title-row");

        const backBtn = document.createElement("button");
        backBtn.type = "button";
        backBtn.className = "panel-back-link";
        backBtn.textContent = "← ALL MOTIFS";

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
        titleRow.appendChild(newTitle);

        panelHeader.insertBefore(controlRow, titleRow);

        // back button:
        //  - restores the full motif list
        //  - resets active motif filters
        //  - restores original header, subtitle, and toggle buttons
        backBtn.addEventListener("click", () => {
          // reset filter to show all motifs again
          activeLabels = new Set(uniqueLabels);
          updateDotAppearance();

          if (currentView === "comunas") {
            // reset comunas view to show just outlines (no motif selected)
            d3.select("#choropleth-legend").style("display", "none");
            comunaShapes
              .attr("fill", "rgba(255, 255, 255, 0.01)")
              .attr("stroke", "#d4d0c5")
              .attr("stroke-width", 0.8)
              .style("pointer-events", "auto")
              .style("cursor", "pointer");
            comunaLabels.attr("fill", "#343a33");
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

          // re-attach view toggle handlers after resetting the dom
          document.querySelectorAll(".toggle-btn").forEach((btn) => {
            btn.addEventListener("click", () => {
              document
                .querySelectorAll(".toggle-btn")
                .forEach((b) => b.classList.remove("active"));
              btn.classList.add("active");
              toggleView(btn.dataset.view);
            });
          });

          // update subtitle based on current view after returning to list mode
          if (sideSubtitleEl) {
            if (currentView === "venues") {
              sideSubtitleEl.textContent = "Each point is a venue. Colors encode naming motifs. Hover any point to see that venue information.";
            } else {
              sideSubtitleEl.textContent = "Each number is a comuna. Hover any comuna to see that comuna information.";
            }
          }

          // update section subtitle based on current view
          if (sideSectionSubtitleEl) {
            if (currentView === "venues") {
              sideSectionSubtitleEl.textContent = "Select a motif to filter venues in the map.";
            } else {
              sideSectionSubtitleEl.textContent = "Select a motif to see that motif's prominence by comuna in the map.";
            }
          }

          // restore default opacity for all active motifs
          placeDots.style("opacity", (d) =>
            activeLabels.has(d.label_clean) ? 0.6 : 0,
          );
        });
      } else {
        // if back button already exists, just update the title and subtitle
        const titleRow = document.querySelector(".side-panel-title-row");
        const titleEl = titleRow.querySelector(".side-title");
        if (titleEl) {
          titleEl.textContent = translatedLabel;
        }
        
        // update subtitle with motif description for subsequent selections
        const sideSubtitleEl = document.querySelector(".side-subtitle");
        if (sideSubtitleEl && motif.description) {
          sideSubtitleEl.textContent = motif.description;
        }
      }
    }

    // -----------------------------------------
    // choropleth legend
    // -----------------------------------------

    // legendContainer is an svg group that holds:
    //  - a background box
    //  - a wrapped title
    //  - a set of color swatches with percentage labels
    const legendContainer = svg
      .append("g")
      .attr("id", "choropleth-legend")
      .attr("transform", "translate(20, 20)")
      .style("pointer-events", "auto")
      .style("display", "none");

    const legendBg = legendContainer
      .append("rect")
      .attr("x", -8)
      .attr("y", -8)
      .attr("width", 180)
      .attr("height", 138)
      .attr("fill", "rgba(255, 255, 255, 0.85)")
      .attr("rx", 3);

    // add wrapped title using foreignObject so text can wrap
    const legendTitleFO = legendContainer
      .append("foreignObject")
      .attr("x", 4)
      .attr("y", 0)
      .attr("width", 160)
      .attr("height", 40);

    legendTitleFO
      .append("xhtml:div")
      .attr("class", "choropleth-legend-title")
      .style("font-size", "11px")
      .style("font-weight", "bold")
      .style("color", "#666")
      .style("line-height", "1.4")
      .style("margin-bottom", "4px")
      .text("Motif percentage per total venues by comuna");

    const legendItemsContainer = legendContainer
      .append("g")
      .attr("id", "legend-items");

    // updateLegend: recomputes legend stops for a given motif, using its max percentage
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

      // deduplicate stops (after rounding) so the legend never shows identical labels
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

      // convert to percentage strings and reverse so highest values appear at the top
      const legendStops = uniqueStops.map((stop) => ({
        pct: stop,
        label: `${Math.round(stop * 100)}%`,
      })).reverse();

      const itemHeight = 20;
      const legendHeight = Math.max(
        legendStops.length * itemHeight + 54,
        140,
      );

      legendBg.attr("height", legendHeight);

      legendStops.forEach((stop, i) => {
        const y = 34 + i * itemHeight;

        legendItemsContainer
          .append("rect")
          .attr("x", 4)
          .attr("y", y)
          .attr("width", 20)
          .attr("height", 16)
          .attr(
            "fill",
            d3.interpolate("#f5f3ee", motifColor)(stop.pct / maxPct),
          )
          .attr("stroke", "#888")
          .attr("stroke-width", 0.5);

        legendItemsContainer
          .append("text")
          .attr("x", 32)
          .attr("y", y + 12)
          .attr("font-size", "11px")
          .attr("fill", "#666")
          .text(stop.label);
      });
    }

    // initialize the ui in "by venues" view (hides comuna fills and choropleth legend)
    toggleView("venues");

    // wire view toggle buttons in the panel to call toggleView with the appropriate mode
    document.querySelectorAll(".toggle-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document
          .querySelectorAll(".toggle-btn")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        toggleView(btn.dataset.view);
      });
    });

    // -----------------------------------------
    // mapbox update events (keep svg in sync)
    // -----------------------------------------

    // update: reprojects all svg elements so they remain aligned with the mapbox view
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

      updatePlaces();
    }

    // respond to view changes and moves by recalculating projected positions
    map.on("viewreset", update);
    map.on("moveend", update);
    map.on("movestart", () => svg.classed("hidden", true));
    map.on("moveend", () => svg.classed("hidden", false));
    map.on("resize", resizeSvg);
    update();

    // -----------------------------------------
    // comuna hover interactivity
    // -----------------------------------------

    // setupComunaHover attaches hover handlers to comunas:
    //  - on mouseover: show tooltip and visually highlight the polygon
    //  - on mouseout: hide tooltip and restore default stroke width
    //  - on mousemove: keep tooltip following the cursor
    function setupComunaHover() {
      comunaShapes
        .on("mouseover", function (event, feature) {
          // show tooltip in comunas view regardless of whether a motif is selected
          if (currentView !== "comunas") return;

          const [x, y] = d3.pointer(event);
          showComunaTooltip(feature, x, y);

          // always highlight the hovered comuna by increasing stroke width
          d3.select(this).attr("stroke-width", 2);
        })
        .on("mouseout", function () {
          hideTooltip();

          // reset stroke width depending on whether a motif is selected or not
          const selectedMotif = Array.from(activeLabels)[0] || null;
          const defaultWidth = (selectedMotif && activeLabels.size === 1) ? 0.8 : 1.5;
          d3.select(this).attr("stroke-width", defaultWidth);
        })
        .on("mousemove", (event) => {
          if (currentView !== "comunas") return;
          const [x, y] = d3.pointer(event);
          moveTooltip(x, y);
        });
    }

    setupComunaHover();

    // -----------------------------------------
    // footer note: data source disclaimer
    // -----------------------------------------

    // in-map footer that documents the primary data source (openstreetmap)
    // and signals that coverage is uneven and may reflect mapping biases
    const footer = document.createElement("div");
    footer.style.cssText = `
      position: absolute;
      bottom: 10px;
      left: 10px;
      font-size: 11px;
      color: #666;
      background: rgba(255, 255, 255, 0.85);
      padding: 8px 12px;
      border-radius: 3px;
      max-width: 300px;
      line-height: 1.4;
      z-index: 10;
      pointer-events: auto;
    `;
    footer.innerHTML = `
      <strong>Data source:</strong> OpenStreetMap
    `;
    mapParent.appendChild(footer);
  });
})();