"use client";
// Drop-a-pin alternative to typing an address (FR-021): no address exists at all, only the point
// clicked, and it stays in this browser. Map tiles come from OpenFreeMap (no key, no account).
import { useEffect, useRef } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Point } from "@/client/near";
import styles from "./near.module.css";

export function PinMap({ centre, onPick }: { centre: Point; onPick: (p: Point) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const pick = useRef(onPick);
  useEffect(() => {
    pick.current = onPick;
  }, [onPick]);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    (async () => {
      const maplibregl = await import("maplibre-gl");
      if (disposed || !box.current) return;
      const map = new maplibregl.Map({
        container: box.current,
        style: "https://tiles.openfreemap.org/styles/positron",
        center: [centre.lon, centre.lat],
        zoom: 9.5,
        attributionControl: { compact: true },
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      const marker = new maplibregl.Marker({ color: "#a8232c" });
      map.on("click", (e) => {
        marker.setLngLat(e.lngLat).addTo(map);
        pick.current({ lat: e.lngLat.lat, lon: e.lngLat.lng });
      });
      cleanup = () => map.remove();
    })();
    return () => {
      disposed = true;
      cleanup();
    };
  }, [centre.lat, centre.lon]);

  return <div ref={box} className={styles.map} role="application" aria-label="Map: click where you live to place a pin" />;
}
