import { useIsDark } from "./theme.js";

/* ---------------------------------------------------------
   LOGÓTIPO DA BIG BOSS — escolhe a versão certa para o tema:
   sobre branco no claro, sobre roxo no escuro. Ficheiros em public/brand.
--------------------------------------------------------- */
const FILES = {
  empilhado: {
    light: "/brand/empilhado/bigboss-empilhado-sobre-branco.svg",
    dark: "/brand/empilhado/bigboss-empilhado-sobre-roxo.svg",
  },
  horizontal: {
    light: "/brand/horizontal/bigboss-horizontal-sobre-branco.svg",
    dark: "/brand/horizontal/bigboss-horizontal-sobre-roxo.svg",
  },
  compacto: {
    light: "/brand/compacto/bigboss-compacto-sobre-branco.svg",
    dark: "/brand/compacto/bigboss-compacto-sobre-roxo.svg",
  },
};

export default function BrandLogo({ variant = "empilhado", height = 150, style }) {
  const dark = useIsDark();
  return (
    <img
      src={FILES[variant][dark ? "dark" : "light"]}
      alt="Big Boss by Empower Boss"
      style={{ display: "block", height, width: "auto", maxWidth: "100%", margin: "0 auto", ...style }}
    />
  );
}
