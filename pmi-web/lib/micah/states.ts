/**
 * US state name ⇄ 2-letter code, plus the Northeast Corridor rail list. Mirrors
 * the prototype's map.jsx `stateNameToCode` and the backend
 * seat_mapping `_STATE_NAME_TO_CODE`. Used by the choropleth (us-atlas features
 * carry `properties.name`), the State detail view, and the NE rail.
 */

export const STATE_NAME_BY_CODE: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon",
  PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
  WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

export const STATE_CODE_BY_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_NAME_BY_CODE).map(([code, name]) => [name, code]),
);

export function stateNameToCode(name: string): string {
  return STATE_CODE_BY_NAME[name] ?? name.slice(0, 2).toUpperCase();
}

/** Right-rail Northeast Corridor order (mirrors data.js `northeast`). */
export const NORTHEAST: string[] = ["VT", "NH", "MA", "RI", "CT", "NJ", "DE", "MD", "DC"];
