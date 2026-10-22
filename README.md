# TerraVita AquaTwin: Ujani Reservoir Demo

A portfolio demo that combines satellite water-extent monitoring, rainfall context,
and a simplified water-balance digital twin for the Ujani Reservoir in Maharashtra, India.

**Live demo:** https://your-username.github.io/terravita-ujani-viewer/

## What it shows
- Monthly water-surface area from Sentinel-2 (optical) and Sentinel-1 (radar)
- Monthly catchment rainfall from CHIRPS
- A 6-month storage baseline from a simplified water balance
- Water-extent polygons for selected months on an interactive map

## Data sources
- Copernicus Sentinel-2 Surface Reflectance (Harmonized) and Sentinel-1 GRD, via Google Earth Engine
- CHIRPS daily rainfall (UCSB Climate Hazards Center)
- OpenStreetMap basemap tiles (© OpenStreetMap contributors)

## Method (summary)
1. NDWI threshold on cloud-masked Sentinel-2 monthly composites gives water area.
2. VV backscatter threshold on Sentinel-1 gives water area during cloudy months.
3. A Random Forest classifier and a Ridge forecast were tested in the notebooks.
4. A water balance converts rainfall and assumed parameters into storage estimates.

## Important limitations
- Storage volumes use placeholder assumptions for depth, capacity, and catchment area.
  They are not measured values.
- The storage baseline uses average rainfall and a placeholder release policy.
  It is a scenario, not a forecast.
- Water masks depend on the chosen threshold and on cloud or wind conditions.
- This is a demonstration built on public data. It is not for operational or
  safety decisions.

## Run locally
