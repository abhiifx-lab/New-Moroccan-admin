import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        "flex h-11 w-full rounded-lg border border-input bg-background/70 px-3 py-2 text-base shadow-sm transition-all placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:bg-muted/40 disabled:opacity-60 md:h-10 md:text-sm",
        className
      )}
      ref={ref}
      {...props} />
  );
})
Input.displayName = "Input"

export { Input }
