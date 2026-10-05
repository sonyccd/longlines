import { Typography, useMediaQuery, type Theme } from "@mui/material";
import type { ReactNode } from "react";

// Swaps Typography variants by breakpoint instead of overriding sizes.
export function PageTitle({ children }: { children: ReactNode }) {
  const mobile = useMediaQuery((t: Theme) => t.breakpoints.down("sm"));
  return (
    <Typography variant={mobile ? "h5" : "h4"} component="h1" gutterBottom>
      {children}
    </Typography>
  );
}
