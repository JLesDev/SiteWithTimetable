export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    const DEV_ID = env.PTV_DEV_ID;
    const API_KEY = env.PTV_API_KEY;

    // Helper function to sign requests
    async function signRequest(pathToSign, queryString) {
      const toSign = `${pathToSign}?${queryString}`;
      const enc = new TextEncoder();
      const key = await crypto.subtle.importKey(
        "raw",
        enc.encode(API_KEY),
        { name: "HMAC", hash: "SHA-1" },
        false,
        ["sign"]
      );
      const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(toSign));
      const signature = [...new Uint8Array(sigBuf)]
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
      return `https://timetableapi.ptv.vic.gov.au${toSign}&signature=${signature}`;
    }

    // Handle departures endpoint (default, root path with ?stop= parameter)
    if (path === "/" || path === "") {
      const stop = url.searchParams.get("stop");
      
      if (!stop) {
        return new Response(JSON.stringify({ error: "Missing stop parameter" }), {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }

      const ptvPath = `/v3/departures/route_type/0/stop/${stop}`;
      const query = `devid=${DEV_ID}&expand=route,direction,run&max_results=10`;
      const ptvUrl = await signRequest(ptvPath, query);

      const res = await fetch(ptvUrl);
      const data = await res.json();

      return new Response(JSON.stringify(data), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    // Handle stations list endpoint
    if (path === "/stations") {
      const allStations = [];

      for (let routeId = 1; routeId <= 17; routeId++) {
        const ptvPath = `/v3/stops/route/${routeId}/route_type/0`;
        const query = `devid=${DEV_ID}`;
        const ptvUrl = await signRequest(ptvPath, query);

        try {
          const res = await fetch(ptvUrl);
          const data = await res.json();
          
          if (data.stops && Array.isArray(data.stops)) {
            allStations.push(...data.stops);
          }
        } catch (error) {
          console.error(`Error fetching route ${routeId}:`, error);
        }
      }

      const uniqueStations = Array.from(
        new Map(allStations.map(station => [station.stop_id, station])).values()
      );

      uniqueStations.sort((a, b) => 
        (a.stop_name || '').localeCompare(b.stop_name || '')
      );

      return new Response(JSON.stringify({
        total_stations: uniqueStations.length,
        stations: uniqueStations
      }, null, 2), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    return new Response("Not found", { 
      status: 404,
      headers: {
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
};