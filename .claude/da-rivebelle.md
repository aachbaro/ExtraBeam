# Direction artistique Rivebelle — vue publique

Extraite de `FreelancerProfilePage` (vue client, octobre 2026).
À appliquer sur toutes les pages publiques/marketing de Rivebelle.

## Palette

| Rôle | Valeur | Usage |
|---|---|---|
| Fond de page | `#f5efe4` | `bg-[#f5efe4]` sur le `<main>` |
| Fond carte / ivoire | `#fffdf7` | bg des cartes, nav, inputs |
| Texte principal | `#352b1d` | corps de texte, titres |
| Bordure carte | `#e0d4bf` | toutes les borders |
| Ombre carte | `#947239` | `shadow-[0_10px_35px_-25px_#947239]` |
| Accent jaune | `#f3c64c` | bande décorative h-3 en haut des cartes principales |
| Primary / ocre | `#956818` | liens, CTA, overrides `eb-primary` |
| Primary hover | `#dba52a` | focus inputs, hover subtil |
| Input bg | `#fffdf7` | inputs |
| Input border | `#decfb5` | inputs au repos |
| Badge/bg jaune pâle | `#f9e8ad` | remplace `bg-eb-primary/10` |

## Typographie

- **Titres H1** : `Georgia, 'Times New Roman', serif` — `font-weight: 400` (léger, pas bold)
  - Taille : `clamp(32px, 6vw, 42px)`
  - La légèreté du serif crée le contraste avec un fond chaud
- **Corps** : DM Sans (inchangé, hérité du système Tailwind)
- **Logo** : DM Serif Display (`font-logo`), couleur `#956818`

## Formes

- Carte principale : `rounded-[26px]` (grand radius)
- Carte secondaire / agenda : `rounded-[24px]`
- Inputs : `border-radius: 12px`
- CTA boutons : `rounded-eb-card` (12px) ou `rounded-xl` (12px)

## Composant carte signature

```tsx
<section className="overflow-hidden rounded-[26px] border border-[#e0d4bf] bg-[#fffdf7] shadow-[0_10px_35px_-25px_#947239]">
  <div className="h-3 bg-[#f3c64c]" />   {/* bande jaune */}
  {/* contenu */}
</section>
```

## Animation d'entrée

```css
@keyframes ebFadeUp {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}
/* durée : 0.4s ease, appliquée sur le <main> */
```

En JSX :
```tsx
<main style={{ animation: "ebFadeUp 0.4s ease both" }}>
  <style>{`@keyframes ebFadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }`}</style>
```

## Override Tailwind dans le contexte chaleureux

Envelopper le composant dans une classe `.riv-warm` et cibler :

```css
.riv-warm .text-eb-primary { color: #956818; }
.riv-warm .bg-eb-primary   { background-color: #956818; }
.riv-warm [class*="bg-eb-primary/"] { background-color: #f9e8ad; }
.riv-warm .border-eb-layout { border-color: #e0d4bf; }
.riv-warm .bg-eb-page       { background-color: #f5efe4; }
.riv-warm .bg-white         { background-color: #fffdf7; }
```
