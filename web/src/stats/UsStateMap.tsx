import { useId } from "react";
import { Box, Stack, Tooltip, Typography, useTheme } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { fillOpacity, fmt } from "./format";
import { STATE_SHAPES } from "./stateShapes";

/**
 * Choropleth of POTA spots per US state. Static: the only interaction is the
 * per-state tooltip, which also works on tap. Shapes come precomputed from
 * stateShapes.ts; colors come from the theme so dark mode just works.
 */
export function UsStateMap({ values }: { values: Record<string, number> }) {
  const theme = useTheme();
  const gradientId = useId();
  const max = Math.max(0, ...Object.values(values));
  const fill = (value: number) => {
    const a = fillOpacity(value, max);
    return a === 0 ? theme.palette.action.hover : alpha(theme.palette.primary.main, a);
  };

  return (
    <Stack spacing={1}>
      <Box
        component="svg"
        viewBox="0 0 975 610"
        role="img"
        aria-label="Map of spots by state"
        sx={{ width: "100%", height: "auto", display: "block" }}
      >
        {STATE_SHAPES.map((s) => {
          const value = values[s.code] ?? 0;
          return (
            <Tooltip key={s.code} title={`${s.name}: ${fmt(value)} spots`} followCursor enterTouchDelay={0}>
              <path d={s.d} fill={fill(value)} stroke={theme.palette.background.paper} strokeWidth={1} />
            </Tooltip>
          );
        })}
      </Box>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <Typography variant="caption" color="text.secondary">0</Typography>
        <Box component="svg" viewBox="0 0 200 10" preserveAspectRatio="none" aria-hidden sx={{ width: 160, height: 10 }}>
          <defs>
            <linearGradient id={gradientId}>
              <stop offset="0%" stopColor={alpha(theme.palette.primary.main, 0.12)} />
              <stop offset="100%" stopColor={theme.palette.primary.main} />
            </linearGradient>
          </defs>
          <rect width="200" height="10" rx="2" fill={`url(#${gradientId})`} />
        </Box>
        <Typography variant="caption" color="text.secondary">{fmt(max)} spots</Typography>
      </Stack>
    </Stack>
  );
}
