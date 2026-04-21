# Preview Analysis

截图显示应用已经正常加载，但直接进入了主页（tabs），没有先显示登录/注册页面。
这说明 auth gate 的 Redirect 没有正确工作——用户未登录时应该被重定向到注册页面。

问题：profile 为 null 时，Redirect 到 /login 应该触发，但似乎直接跳过了。
可能原因：initialRouteName 设为 "login" 但 Redirect 和 anchor 设置冲突。
