# Project TODO

- [x] 迁移现有项目代码到新 webdev 项目
- [x] 安装额外依赖（expo-image-picker, expo-media-library, expo-file-system, expo-sharing, expo-speech, expo-contacts 等）
- [x] 修复聊天助手无法回复的问题（chat.tsx 传递 longTerm 参数 + role 类型修正）
- [x] 个人页添加登录/注销操作入口（profile.tsx 身份卡片底部退出登录按钮）
- [x] 注册时填写完整个人信息（login.tsx 含姓名、手机号、紧急联系人姓名/手机/关系，支持通讯录选择）
- [x] 检测完成后新增「讲述问题」界面（narrate.tsx，分析完成后跳转，支持快速填入和自由描述）
- [x] 发送提醒短信改为直接从通讯录选择联系人（detect.tsx + report.tsx 均已更新）
- [x] 生成品牌图标并更新 app.config.ts
- [x] 修复聊天助手流式输出每个字符独立成行的渲染 bug（Gemini thinking 模式返回数组 content 导致，已过滤 thinking blocks 并禁用 thinking 模式）
- [x] 修复退出登录无法正常退出的问题（统一 Stack 路由注册 + Redirect 门控）
- [x] 修复聊天回复仍然每字独立成行的问题（服务器重启后生效）
- [x] 彻底修复退出登录（Redirect 移到 Stack 外 + router.replace 强制跳转 + 清除 onboarding 状态）
- [x] 修复未登录用户直接进入主页的问题（改用 useEffect + router.replace 做 auth gate，移除 anchor 设置）
- [x] 彻底修复聊天每字一行（ark-client join("\n")→join("") + cleanPerCharNewlines 防御性清洗）
