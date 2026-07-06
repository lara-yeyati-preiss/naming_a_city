Live demo: https://lara-yeyati-preiss.github.io/naming_a_city.html

Naming a City — by Lara Yeyati Preiss

## Concept

Naming a City explores the cultural identity of Buenos Aires as revealed through its commercial landscape, by examining the cafés, bars, restaurants, bookstores, cinemas, and theaters that line its streets.

The site offers an interactive map to explore how naming patterns distribute across neighborhoods. Each venue is classified into a cultural motif — Italian heritage, French heritage, Argentine folklore, religious devotion, and others — revealing which motifs are most visible in which parts of the city.

## Data & Methods

- **Data source:** [OpenStreetMap](https://www.openstreetmap.org/) venue names, coordinates, and metadata via the Overpass API, filtered to Ciudad Autónoma de Buenos Aires.
- **Spatial enrichment:** Point-in-polygon joins with barrio and comuna boundaries from the [Buenos Aires open data portal](https://data.buenosaires.gob.ar). Socioeconomic indicators merged at the comuna level from [Comunas en la Web](https://www.estadisticaciudad.gob.ar/eyc/comunasenlaweb/).
- **Classification:** Hybrid approach combining regex pattern matching, LLM-assisted tagging with structured prompts, and manual review.
- **Analysis:** TF-IDF term extraction per motif; Pearson correlations between motif prevalence and comuna-level income and age.
- **Visualization:** Mapbox GL for the interactive map, D3.js for charts and data binding.

<img width="1728" height="972" alt="naming-cover" src="https://github.com/user-attachments/assets/08089d63-8136-4805-9aca-d8cff1abf1e8" />
<img width="1728" height="972" alt="naming-italian" src="https://github.com/user-attachments/assets/5e5db7de-1f39-42b0-82f0-0cf40efe5cbd" />
<img width="1728" height="972" alt="naming-italian-choropleth" src="https://github.com/user-attachments/assets/93128f3a-1e81-43a9-b3df-de5408920b2d" />

