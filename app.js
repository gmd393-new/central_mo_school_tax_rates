//////////////////////////////////////////////////////////////////
// 1) Load taxData.json, then build the chart
//////////////////////////////////////////////////////////////////
let taxData = [];    // We'll store the loaded JSON here
let taxLookup = {};  // For quick districtName -> taxValue lookup

fetch("taxData.json") // <-- Ensure path is correct
  .then(response => response.json())
  .then(data => {
    taxData = data;

    // Sort data by tax ascending
    taxData.sort((a, b) => d3.ascending(a.tax, b.tax));

    // Build our bar chart using taxData
    buildBarChart();

    // Prepare the lookup so we can attach the tax rate to map popups
    taxData.forEach(d => {
      taxLookup[d.name] = d.tax;
    });

    // After the chart is ready, init the map + load GeoJSON
    initMap();
  })
  .catch(err => console.error("Error loading taxData.json:", err));


//////////////////////////////////////////////////////////////////
// 2) D3 Bar Chart
//////////////////////////////////////////////////////////////////
let chartGroup; // We'll define chartGroup globally so we can use it later
let x, y;       // If you want to access scales outside buildBarChart

function buildBarChart() {
  // Dimensions for the internal coordinate system (viewBox).
  const chartWidth = 480;
  const chartHeight = 750;
  const margin = { top: 20, right: 50, bottom: 20, left: 170 };

  // Create scales
  x = d3.scaleLinear()
    // If you want the x-axis to start at 2.5, do domain([2.5, max])
    .domain([2.5, d3.max(taxData, d => d.tax)])
    .range([0, chartWidth - margin.left - margin.right]);

  y = d3.scaleBand()
    .domain(taxData.map(d => d.name))
    .range([0, chartHeight - margin.top - margin.bottom])
    .padding(0.1);

  // Create an SVG with a viewBox for responsiveness
  const svgChart = d3.select("#chartContainer")
    .append("svg")
    .attr("viewBox", `0 0 ${chartWidth} ${chartHeight}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  // Create a group for the bars/axes
  chartGroup = svgChart.append("g")
    .attr("transform", `translate(${margin.left}, ${margin.top})`);

  // Draw bars
  chartGroup.selectAll(".bar")
    .data(taxData)
    .enter()
    .append("rect")
    .attr("class", "bar")
    .attr("y", d => y(d.name))
    .attr("height", y.bandwidth())
    .attr("x", 0)
    .attr("width", d => x(d.tax))
    // Mouseover/out
    .on("mouseover", function(event, d) {
      d3.select(this).classed("highlighted", true);
      highlightDistrictOnMap(d.name, true);
    })
    .on("mouseout", function(event, d) {
      d3.select(this).classed("highlighted", false);
      highlightDistrictOnMap(d.name, false);
    })
    // Click to open popup on map
    .on("click", function(event, d) {
      highlightDistrictOnMap(d.name, true);
      const layer = districtLayers[d.name];
      if (layer) {
        layer.openPopup();
      }
    });

  // Add a text label for each bar (tax rate)
  chartGroup.selectAll(".bar-label")
    .data(taxData)
    .enter()
    .append("text")
    .attr("class", "bar-label")
    .attr("x", d => x(d.tax) + 5)                   // label to the right of bar
    .attr("y", d => y(d.name) + y.bandwidth() / 2)  // vertically centered
    .attr("dy", "0.35em")
    .style("font-size", "10px")
    .style("fill", "#333")
    .text(d => `$${d.tax.toFixed(2)}`);

  // Y-axis
  chartGroup.append("g")
    .call(d3.axisLeft(y));

  // X-axis with $ sign
  chartGroup.append("g")
    .attr("transform", `translate(0, ${chartHeight - margin.top - margin.bottom})`)
    .call(d3.axisBottom(x).tickFormat(d => `$${d.toFixed(2)}`));
}


//////////////////////////////////////////////////////////////////
// 3) Leaflet Map & GeoJSON Overlay
//////////////////////////////////////////////////////////////////
let map;
let districtLayers = {}; // Store references for cross-highlighting

function initMap() {
  // Create the Leaflet map
  map = L.map("map", {
    scrollWheelZoom: false, // helps scrolling on mobile
    tap: false              // also helps page scrolling
  }).setView([38.5767, -92.1735], 7);

  // Add basemap
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
  }).addTo(map);

  // Load your GeoJSON
  fetch("output_missouri_filtered.geojson")
    .then(resp => resp.json())
    .then(geoData => {
      const districtsLayer = L.geoJSON(geoData, {
        style: feature => ({
          color: "black",
          weight: 1,
          fillColor: "lightgray",
          fillOpacity: 0.6
        }),
        onEachFeature: (feature, layer) => {
          const districtName = feature.properties.NAME || "Unknown";
          // Build popup with name + tax rate
          const rate = taxLookup[districtName] ?? "N/A";
          layer.bindPopup(`${districtName}<br>Tax Rate: $${rate}`);

          // Store reference so we can highlight from chart->map
          districtLayers[districtName] = layer;

          // Mouseover highlight polygon & highlight bar
          layer.on("mouseover", () => {
            layer.setStyle({
              fillColor: "#fc8d62", // salmon color
              fillOpacity: 0.8
            });
            highlightBar(districtName);
          });

          // Mouseout revert polygon & remove bar highlight
          layer.on("mouseout", () => {
            layer.setStyle({
              fillColor: "lightgray",
              fillOpacity: 0.6
            });
            unHighlightBar();
          });
        }
      }).addTo(map);

      // Fit map to the districts
      map.fitBounds(districtsLayer.getBounds());
    })
    .catch(err => console.error("Error loading GeoJSON:", err));
}


//////////////////////////////////////////////////////////////////
// 4) Cross-Highlighting Functions
//////////////////////////////////////////////////////////////////

// A) From chart -> map highlight
function highlightDistrictOnMap(districtName, highlight) {
  const layer = districtLayers[districtName];
  if (layer) {
    if (highlight) {
      layer.setStyle({
        fillColor: "#fc8d62", // salmon color
        fillOpacity: 0.8
      });
    } else {
      layer.setStyle({
        fillColor: "lightgray",
        fillOpacity: 0.6
      });
    }
  }
}

// B) From map -> chart highlight
function highlightBar(districtName) {
  // Remove highlight from all bars first
  chartGroup.selectAll(".bar").classed("highlighted", false);

  // Highlight only the matching bar
  chartGroup.selectAll(".bar")
    .filter(d => d.name === districtName)
    .classed("highlighted", true);
}

function unHighlightBar() {
  chartGroup.selectAll(".bar").classed("highlighted", false);
}
