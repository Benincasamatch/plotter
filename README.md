# 写字机 · xieziji

浏览器编辑与预览，连接写字机的电脑运行本地 Python 服务。支持读取 `.gfont` 矢量笔画并生成 G-code，直接通过串口控制已验证的 GRBL 写字机。

**许可：PolyForm Noncommercial 1.0.0。** 本项目供许可允许的非商业用途使用，许可全文见 [LICENSE](LICENSE)。这是源码可用的非商业许可，不称作 OSI 开源许可。第三方字体不随项目分发，其使用与再分发许可由相应权利人决定。

## 功能

- 字体选择与搜索，中文/英文自动换行；调整字高、字距、行距和边距。
- A4 横向/竖向 SVG 笔画预览，下载与预览一致的 G-code。
- 串口枚举与连接、只读原点/配置检查、单任务写入进度、暂停/继续。
- 逐条等待 `ok`，报警或通信失败时停止发送并尽力请求 feed hold。
- 完成后抬笔、返回原点，等待实际 Idle 并核对机器坐标。
- 模拟模式和不依赖商业字体的自动化测试。

没有图片转路径、文档导入、多页送纸或任意 G-code 执行接口。现有字体的笔画可读取，字距、基线和换行采用自建排版规则。

## 快速开始

需要 Python **3.10+**。仓库包含原创的简单英文演示字体，可直接运行模拟模式：

```powershell
git clone https://github.com/QScholar/xieziji.git
cd xieziji
.\start.ps1 -Simulate
```

打开 [http://127.0.0.1:8080](http://127.0.0.1:8080)，选择字体、生成预览、连接模拟设备，即可验证完整操作流程，模拟模式不会连接串口或移动机器。

也可以手动启动，适用于 Windows/Linux/macOS：

```bash
python -m venv .venv
# Windows PowerShell
.venv/Scripts/python.exe -m pip install -r requirements.txt
.venv/Scripts/python.exe -m plotter.server --simulate

# Linux/macOS
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m plotter.server --simulate
```

前端随后端提供，无需 Node 或外部 CDN。代码不依赖 Windows 专用 API，实机验证目前仅在 Windows 完成。

## 接入现有字体与真实设备

将有权使用的 `.gfont` 放入 `gcodeFonts/`，或者指定字体目录：

```powershell
.\start.ps1 -FontDir 'C:\path\to\gcodeFonts'
```

手动启动：

```bash
python -m plotter.server --font-dir /path/to/gcodeFonts
```

选择机器所在串口并连接。将纸张放好，笔位于纸张左上角，设备机器坐标为 `(0,0,0)`，X+ 向右、Y+ 向下。生成预览后先检查原点与配置，再勾选确认并点击“开始写字”。网页不提供自动回零、设置原点或解除报警功能。

当前真实设备支持范围：

| 项目 | 已验证配置 |
| --- | --- |
| 固件标识 | `1.3a.20221114` |
| 串口 | 115200 baud、8N1 |
| 抬笔/落笔 | Z0 / Z10 |
| 轴方向 | `$3=7` |
| 每毫米步数 | `$100=80`、`$101=80`、`$102=100` |
| 工作坐标 | G54、G92 与刀具偏移均为零 |
| 限位/回零配置 | `$20=0`、`$21=0`、`$22=0` |
| 默认速度 | 书写 1800、空移/抬落笔 3000 mm/min |

这些参数来自一台已实测设备，服务只检查它们，不修改固件设置。其他设备可能使用不同的轴方向、笔控制或固件，当前版本会拒绝不符合配置的机器。

“暂停”请求控制器减速停下，笔不会自动抬起；“继续”恢复任务。进度是已确认指令数量，未必等于即时纸面完成比例。协议命令说明见 [GRBL 官方文档](https://github.com/gnea/grbl/wiki/Grbl-v1.1-Commands)。

## 远程浏览器使用

后端运行在连接设备的电脑，默认只监听本机。可以通过 SSH 转发使用远端电脑上的设备：

```bash
# 设备电脑：允许客户端转发端口
python -m plotter.server --font-dir /path/to/gcodeFonts --allow-origin-port 18081
# 客户端：保持隧道运行
ssh -N -L 18081:127.0.0.1:8080 user@machine
```

客户端浏览器打开 `http://127.0.0.1:18081`。后端和隧道均需保持运行，本项目未自动配置系统服务或开机启动。

局域网监听必须配置至少 16 位访问令牌，并指定允许的访问地址：

```powershell
$env:PLOTTER_TOKEN = 'replace-with-your-own-long-random-token'
python -m plotter.server --host 0.0.0.0 --allow-host 192.168.1.100
```

替换为实际局域网地址，在网页“服务访问令牌”中填入同一令牌。程序不自动开放防火墙。远程访问优先使用 SSH 隧道。

## 任务与状态

任务保存在 `plotter/jobs/<任务编号>/`，包含 G-code、预览、元数据、执行前查询、串口日志与状态。默认保留最近 8 个预览用于启动/下载，旧文件仍留在磁盘；重启后重新生成预览。每份文字最多 3000 字、200000 路径点，只允许同时执行一个任务。

通信失败或控制器报警后，可能仍保留已排队的动作。服务不会自动清空队列、解锁或恢复失败任务；需先在设备端处理、重新定位并重启服务。服务启动不自动连接或写字。退出后端前先完成当前任务。

## 开发与测试

```bash
python -m pip install -r requirements.txt
python -m unittest discover -v
```

测试使用项目原创的生成字体与模拟串口，不需要机器或第三方字体。覆盖排版边界、缺字/非法数据、预览/导出/模拟写入、暂停/继续、物理 Idle 等待、报警停止发送、原点/坐标偏移拒绝、跨站请求、Host 检查和令牌认证。GitHub Actions 在 Windows 与 Linux、Python 3.10 与 3.12 上运行。

演示与测试字体可以重建：

```bash
python scripts/generate_demo_font.py
```

项目使用 Python 标准库，串口依赖为 `pyserial==3.5`；依赖仍遵循各自许可。项目许可仅适用于本项目原创代码、文档及示例数据，参见 [NOTICE](NOTICE)。
