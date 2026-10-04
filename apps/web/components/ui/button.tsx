import * as React from "react";
import type { ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // whitespace-nowrap is load-bearing: every button is fixed-height (h-11/h-9/h-12),
  // so without it a long label wraps to two lines that get squeezed into one row
  // height and render as overlapping ghost text. Always nowrap; if a label is
  // genuinely too long, the button widens — that's the correct behavior.
  "inline-flex items-center justify-center whitespace-nowrap rounded-full text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-white shadow-panel hover:opacity-90",
        secondary: "bg-card text-foreground ring-1 ring-border hover:bg-muted/80",
        ghost: "text-foreground hover:bg-muted/70",
      },
      size: {
        default: "h-11 px-5",
        sm: "h-9 px-4 text-xs",
        lg: "h-12 px-6",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, ...props }, ref) => (
  <button ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
));

Button.displayName = "Button";
