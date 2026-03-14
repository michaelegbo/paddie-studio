import { jsx as _jsx } from "react/jsx-runtime";
export function Button({ variant = "primary", className = "", ...props }) {
    const base = "inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-medium transition-colors";
    const styles = variant === "ghost"
        ? "border border-white/10 bg-white/5 text-white hover:bg-white/10"
        : "bg-gradient-to-r from-[#3D73DD] to-[#0F57E5] text-white hover:opacity-90";
    return _jsx("button", { className: `${base} ${styles} ${className}`.trim(), ...props });
}
