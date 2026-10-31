# Northern Frontier / Северный рубеж — asset credits

All assets in assets/manifest.json are bundled, loaded and used by the survival game.
The manifest pins original Git blob hashes and original paths for reproduction.

## Quaternius — CC0 1.0

Survival Pack, Nature Pack, Animals Pack, Modular Men, Buildings Pack 2.
Creator: Quaternius, https://quaternius.com/
Source mirror: https://github.com/trebeljahr/quaternius-showcase
License declaration (including original pack links):
https://github.com/trebeljahr/quaternius-showcase/blob/main/LICENSES.md
License: https://creativecommons.org/publicdomain/zero/1.0/
Models scaled, recolored through lighting/materials and instanced. Animal animations
are provided by the original pack; humanoid motion is procedural.

## Babylon.js Assets contributors — Creative Commons Attribution 4.0 International

Source: https://github.com/BabylonJS/Assets
License declaration: https://github.com/BabylonJS/Assets/blob/master/README.md
License and legal code: https://creativecommons.org/licenses/by/4.0/
https://creativecommons.org/licenses/by/4.0/legalcode

Assets: ibl/forest.hdr; meshes/Trees/rawtrees.babylon and its six bark/foliage/
billboard textures; textures/rockyGround_{basecolor,metalRough,normal}.png;
textures/grass.png; textures/waterFoam_circular_mask.png;
sound/Snow_Man_Scene/winterWoods.mp3.

Adaptations: left-handed Babylon geometry converted to Three.js at runtime;
LOD selection/instancing and PBR material adaptation; foliage tone and lighting;
GPU texture resolution limited to 1024px on coarse-pointer phones and 2048px
on desktop (original files bundled); terrain/grass blending; animated foam UVs.
Forest HDR is used for prefiltered image-based lighting, not duplicated as DDS.
Winter woodland audio loops as environmental ambience, with user mute control.
No endorsement by the creators is implied. Individual source paths and Git blob
hashes are in assets/manifest.json; scripts/fetch-assets.py reproduces originals.

## Fonts — SIL Open Font License 1.1

Oswald and Manrope, distributed by @fontsource.
Full copyright and license notices: licenses/Oswald-OFL.txt and
licenses/Manrope-OFL.txt.

## Software

Three.js — MIT, https://github.com/mrdoob/three.js/blob/dev/LICENSE
Capacitor — MIT, https://github.com/ionic-team/capacitor/blob/main/LICENSE
Other npm dependencies retain their own licenses. Original project source license
remains in the repository root. No dummy data or deliberately unused size padding.
