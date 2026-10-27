# 星间 · Solar Voyager

一个可以驾驶飞船、改变航速与时间、近距离观察行星的开源三维太阳系网站。界面以中文为主，使用 Three.js 渲染，使用 Astronomy Engine 计算天体位置。

这是面向浏览器的太阳系探索项目，包含太阳、八颗行星与月球。项目代码采用 MIT 许可证，行星纹理单独遵循 CC BY 4.0。可以在 GitHub 公开源码，并通过 GitHub Pages 发布可访问的网站。

## 发布到 GitHub 与 GitHub Pages

1. 登录 GitHub，在新建仓库页面创建 `solar-voyager`，可见性选择 **Public**。本项目已经包含 README 和许可证，创建空仓库时不必重复添加。
2. 将本目录的全部内容推送到仓库根目录，包括隐藏的 `.github/` 和 `.gitignore`。不要把整个项目再套在仓库的一个子目录里，也不要只上传 ZIP 文件。
3. 打开仓库 **Settings → Pages → Build and deployment → Source**，选择 **GitHub Actions**。
4. 打开 **Actions → Deploy Solar Voyager to GitHub Pages → Run workflow**。后续推送到 `main` 会自动测试并发布。
5. 流程完成后，在 **Settings → Pages** 或 Actions 的 `github-pages` 部署结果中复制网址，即可分享给其他人。

本地已安装 Git 时，可在此目录执行以下命令；把 `YOUR_USERNAME` 替换成自己的 GitHub 用户名。如果本地 Git 尚未配置提交者姓名与邮箱，先按 Git 的提示配置自己的信息。

```sh
git init -b main
git add .
git commit -m "Initial open-source release"
git remote add origin https://github.com/YOUR_USERNAME/solar-voyager.git
git push -u origin main
```

源码公开和网页部署是两项独立操作：仓库设为 Public 后可查看、下载代码；Pages 部署成功后才得到在线体验网址。本项目不需要 Copilot 插件或订阅，也不需要在工作流中填写个人访问令牌。

完整配置采用 [GitHub 官方 Pages 工作流方式](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。若首次推送时还没有启用 Pages，先完成第 3 步，再重新运行工作流。

## 本地启动

解压源码包，在包含 `server.mjs` 与 `dist/` 的项目目录中启动静态服务器。

安装了 Node.js 时：

```sh
node server.mjs
```

或使用 Python 3：

```sh
python -m http.server 4173 --directory dist
```

然后打开 **http://localhost:4173**。按 `Ctrl+C` 停止服务器。

不需要执行 `npm install`，也不需要构建。应用 JavaScript、第三方库和行星纹理均已随包保存在本地，运行时不依赖外部 CDN。请通过 HTTP 访问；直接双击 `index.html` 会受到浏览器模块与文件访问限制。浏览器需要支持 WebGL 2，并启用 JavaScript。

## 可以探索什么

- **真实尺度太阳系**：行星的距离与半径保持真实比例，星历随模拟日期更新。
- **目的地导航**：搜索和选择天体，一键抵达近旁，切换环绕观察与自由驾驶。
- **自由飞行**：控制视角与六个方向的移动，用对数滑块或预设调整航速；速度可超过光速，便于跨越行星间距离。
- **行星细节**：本地地图纹理、地球云层与夜间灯光、土星环，以及昼夜光照。
- **时间控制**：设置 UTC 日期、暂停或加速时间，并返回当前时刻。
- **观察辅助**：天体信息、轨道线、天体标签、俯视导航图、曝光与渲染精度调节、截图和全屏。
- **响应式界面**：小屏幕可展开目的地与详情，驾驶模式提供触屏方向键。

## 操作方式

| 操作 | 功能 |
| --- | --- |
| 选择目的地 → 一键抵达 | 前往目标天体附近 |
| 环绕观察 | 围绕当前目标调整观察视角 |
| 开始驾驶 / 飞船驾驶 | 进入自由驾驶模式 |
| 按住画面拖动 | 环绕目标或转动驾驶视角 |
| 鼠标滚轮 | 环绕模式调整距离；驾驶模式调整航速 |
| `W` / `S` | 前进 / 后退 |
| `A` / `D` | 左移 / 右移 |
| `Q` / `E` | 下降 / 上升 |
| 方向键 | 转动飞船视角 |
| `Shift` | 临时加速 |
| `Space` | 制动 |
| `F` | 聚焦所选天体 |
| `H` | 显示或隐藏界面 |
| `Esc` | 退出驾驶或关闭窗口 |

输入日期、选择选项或搜索时，应先结束文本输入再使用飞行快捷键。触屏设备可以拖动视角，并使用驾驶模式中的屏幕方向键。

## 位置、时间与精度

本项目将 **1700—2200 年**作为界面支持的模拟日期范围。日期输入以 **UTC** 解释。行星的位置由本地 [Astronomy Engine](https://github.com/cosinekitty/astronomy) 计算，使用同一时刻的日心几何位置，并转换到固定的 **J2000 黄道坐标系**。月球的位置由地球日心位置与月球地心几何位置相加得到。

Astronomy Engine 的设计目标是约 **1 角分**的天文计算精度。这个角度目标不等于一个固定的公里级位置误差，也不构成本应用对全部对象、全部日期或全部测量量的精度保证。本项目没有声称达到 JPL DE440 等数值星历的精度，不能用于真实航天导航。显示的是同一时刻的几何中心位置，没有模拟光行时或光行差，因此与从特定观察者看到的视位置不同。

内部距离以天文单位（AU）表达，`1 AU = 149,597,870.7 km`。渲染场景采用右手坐标，J2000 黄道向量转换为 `(x, y, z) = (ECL.x, ECL.z, -ECL.y)`，使场景的 Y 轴向上。

半径采用项目数据表中的**赤道半径**，以球形网格近似；太阳使用名义半径。展示的公转和自转周期为参考值，行星位置由星历独立求解。轨道线为辅助观察的采样路径，导航小图采用距离对数缩放，不能用小图直接量取线性距离。

## 视觉模型与范围

- 行星表面使用二维地图纹理。表面朝向、轴倾角表现、自转、云层、城市灯光和天气均为视觉近似，不是所选时刻的实时影像或精确地表姿态。
- 纹理来源对原始影像做过颜色调整，并可能补全未覆盖区域；这些图像不是科学测量产品。
- 背景星空是程序生成的装饰星场，不对应真实恒星星表。
- 飞船是可自由移动的探索相机。超光速是旅行便利功能，没有模拟真实推进、引力轨道动力学或相对论。
- 本项目提供行星尺度的观察，不包含 SpaceEngine 的完整宇宙数据库、地表地形漫游或程序化星系生成。

## 文件结构

```text
solar-voyager/
├─ README.md
├─ LICENSE
├─ server.mjs
├─ tests/
│  └─ ephemeris.test.mjs
└─ dist/
   ├─ index.html
   ├─ style.css
   ├─ ASSET-LICENSES.md
   ├─ js/
   │  ├─ main.js
   │  └─ ephemeris.js
   ├─ vendor/
   └─ assets/textures/
```

`dist/` 是可直接部署的静态网站目录，可托管于支持静态文件与 ES modules 的 HTTP 服务。保留其中的相对路径和许可证文件即可。

### 生成网站内的源码下载包

GitHub Pages 工作流会在发布前自动生成 `dist/source.zip`。本地运行时，如需使用网页底部的“开源代码”下载按钮，先运行：

```sh
python scripts/package_source.py
```

脚本只使用 Python 标准库，包含本项目源码、测试、许可证和素材，排除 `.git/`、`.openai/`、环境变量文件及生成的 ZIP，避免循环打包。生成的 `dist/source.zip` 不提交到 Git。也可以指定输出路径：

```sh
python scripts/package_source.py --output solar-voyager-source.zip
```

## 验证星历模块

在项目目录运行：

```sh
node tests/ephemeris.test.mjs
```

测试覆盖坐标转换与星历模块的相关约束。测试通过不代表完成对整个日期范围的独立高精度天文认证。

## 许可证与致谢

项目应用代码采用 [MIT License](LICENSE)，版权所有 © 2026 Solar Voyager contributors。

第三方内容保留其各自许可证：

- [Three.js](https://threejs.org/)：MIT；许可证随库保存在 `dist/vendor/`。
- [Astronomy Engine](https://github.com/cosinekitty/astronomy)：MIT；许可证随库保存在 `dist/vendor/`。
- **Planet textures: Solar System Scope / INOVE, CC BY 4.0.** 行星纹理采用 [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)，不是 MIT。复制或再发布纹理时须保留署名、来源、许可证链接并说明修改；完整来源与文件记录见 [ASSET-LICENSES.md](dist/ASSET-LICENSES.md)。
- 天体参考参数来源包括 [NASA NSSDCA Planetary Fact Sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/)。

修改代码后可以重新分发或部署。请同时保留代码许可证及第三方素材的署名与许可说明。
