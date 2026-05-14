// Общая точка входа: preact + htm, чтобы все view-модули брали из одного места.
import { h, render } from "https://esm.sh/preact@10.24.0";
import { useState, useEffect, useMemo, useRef, useCallback } from "https://esm.sh/preact@10.24.0/hooks";
import htm from "https://esm.sh/htm@3.1.1";

export const html = htm.bind(h);
export { h, render, useState, useEffect, useMemo, useRef, useCallback };
