# 3D 道具模型

来自 [Kenney Furniture Kit](https://kenney.nl/assets/furniture-kit)（CC0 1.0，可自由使用，无需署名），
用 `@gltf-transform/cli optimize --compress meshopt --texture-compress false` 压缩后随仓库分发，
运行时由 three-stdlib 内置的 meshopt 解码器解码，**不会访问外网**（不要改用 Draco：其解码器会从 CDN 拉取）。

映射关系见 `src/lib/map/glb-props.ts`；缺少模型的物件回退到 `src/lib/map/object-specs.ts` 的程序化规格。

重新生成：

```bash
npx @gltf-transform/cli optimize <kit>/Models/GLTF\ format/<name>.glb public/models/<name>.glb --compress meshopt --texture-compress false --simplify false
```
