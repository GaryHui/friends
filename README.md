# 暖友 Friends4U

这是一个虚拟朋友网站。当前线上地址：

```text
https://friends4u.vercel.app
```

## 关键后台

- Vercel：部署网站、配置后端环境变量。
- Supabase：保存用户档案、用户允许留下的长期记忆，并提供登录能力。
- Google Cloud：提供 Google 登录的 OAuth Client ID 和 Client Secret。
- 阿里百炼 / DashScope：提供千问模型回复。

## Vercel 环境变量

在 Vercel 项目里进入：

```text
Project Settings -> Environment Variables
```

需要配置：

```text
DASHSCOPE_API_KEY=你的千问 API Key
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
QWEN_MODEL=qwen-turbo

SUPABASE_URL=https://fcmcbolicactqtibbdcj.supabase.co
SUPABASE_ANON_KEY=你的 Supabase publishable / anon key
SUPABASE_SERVICE_ROLE_KEY=你的 Supabase service role key

# 可选：产品外壳
PUBLIC_PRODUCT_VARIANT=domestic
```

注意：

- `DASHSCOPE_API_KEY` 和 `SUPABASE_SERVICE_ROLE_KEY` 只能放在 Vercel 环境变量里，不能写进前端代码。
- 改完环境变量后，需要重新部署一次 Vercel。
- `PUBLIC_PRODUCT_VARIANT` 默认是 `domestic`，也就是国内版“暖友 / 小暖”：有边界、有记忆、有成长的亲密陪伴。
- 如果未来拆海外站，可以在海外 Vercel 项目里设成 `overseas`，前端会切到更直接的 AI companion 包装，后端提示词也会走更接近 AI girlfriend / boyfriend 的定位。

## 产品双版本路线

当前代码按“一套核心，两套外壳”设计：

- 国内版：`domestic`
  - 品牌：暖友 / 小暖。
  - 模式：倾诉、社交、心动。
  - 重点：情绪陪伴、授权记忆、关系成长、隐私边界、长期可信。
  - 心动模式也保持边界，不做露骨成人内容，不制造危险依赖。
- 海外版：`overseas`
  - 品牌外壳可以独立域名、独立 UI、独立条款。
  - 模式文案会更直接偏 AI girlfriend / boyfriend / romantic companion。
  - 后续可扩展角色选择、订阅、点数、图片、语音、剧情等商业化模块。

两版共用底层能力：

- Supabase 账号系统。
- 每个账号独立的 `profiles`、`memory_cards`、`companion_cores`。
- 用户授权记忆。
- 小暖/伴侣人格核心。
- 关系档案和关系小瞬间。
- 千问模型网关。

## Supabase 登录设置

进入 Supabase 项目：

```text
Authentication -> URL Configuration
```

设置：

```text
Site URL:
https://friends4u.vercel.app

Redirect URLs:
https://friends4u.vercel.app/*
```

如果以后换成自己的域名，比如 `https://friends4u.com`，这里也要同步改成：

```text
Site URL:
https://friends4u.com

Redirect URLs:
https://friends4u.com/*
```

## 记忆和隐私原则

暖友的默认原则是：

- 默认不把完整聊天记录同步到 Supabase。
- 未登录时是“随便聊聊”：聊天只留在当前页面内存里，刷新或离开后不继续保存，也不会开启私人日记本。
- 登录后才开启本机私人日记：聊天内容只保存在用户当前浏览器的本地存储里，用来显示当前设备上的私人日记。
- 当前本机私人日记没有加密；同一台设备、同一个浏览器账号里，别人打开网站可能看得到。
- 用户退出账号时，网站会清除本机聊天、心情、档案和本地记忆缓存。
- 页面无活动会自动退出并清除当前页面记录；默认 2 分钟，用户可以在账号面板里改成 5、10、30 分钟或关闭。
- 为了生成回复，当前对话会发送给 AI 服务处理；但不会默认保存成账号长期记忆。
- 只有用户明确点“记住”的事，才会压缩成一条长期记忆，写入 Supabase 的 `memory_cards` 表。
- 名字和称呼这类明确身份信息会即时询问；性格、偏好、边界和有效方法会先进入“记忆收纳箱”，由用户编辑后再决定是否保存。
- 记忆收纳箱默认不每条都打断用户；候选记忆积攒到 2 条以上时，小暖才找机会轻轻提醒一次。用户也可以在记录页手动写一条想让小暖记住的事。
- 用户名字这类身份信息，会在用户允许后写入 Supabase 的 `profiles.nickname`。
- 用户可以在“记录”里删除长期记忆；删除后会把 Supabase 里的记忆状态改成 `deleted`。
- 用户也可以在聊天里直接说“忘掉某件事”“删除关于名字的记忆”等，小暖会删除匹配的长期记忆。
- Supabase RLS 用来防止用户互相访问数据；它不是对云服务商的端到端加密保证。更高隐私等级需要本地加密或端到端加密。

推荐保存的数据形态：

```text
profiles
- user_id
- nickname
- companion_tone

memory_cards
- user_id
- type
- content
- status
- sensitivity

companion_cores
- user_id
- core
- nudge_stats
```

不推荐默认保存：

```text
完整聊天原文
用户没有明确授权的情绪细节
身份证、住址、电话、精确位置等敏感信息
```

面向用户的隐私承诺建议保持诚实：

```text
小暖默认不会把完整聊天记录保存到账号里。
只有你明确允许记住的事，才会保存为账号记忆。
我们会尽量把记忆压缩成偏好、边界和陪伴方式，而不是保存原始倾诉内容。
当前对话会发送给 AI 服务用于生成回复，但不会默认进入长期记忆。
你可以随时删除记忆，也可以直接对小暖说“忘掉这件事”。
```

### 小暖认知核心表

`companion_cores` 保存的是“小暖自己的成长记录”，不是用户的具体隐私事实。它适合保存：

```text
小暖的陪伴原则
小暖自己的说话偏好
哪些破冰方式有效或无效
用户反馈过的相处方式偏好，例如少分析、少追问、先陪着
小暖和这个用户之间的成长事件摘要，例如第一次见面、学会一条边界、学会一种舒服的陪伴方式
```

每个用户只有自己的小暖：`companion_cores.user_id` 是主键，一位用户对应一份 `core`。`core` 里可以同时保存人格核心和成长记忆，例如：

```json
{
  "self": {},
  "principles": [],
  "learnedStyle": {
    "avoid": [],
    "prefer": []
  },
  "memoryFollowUps": {
    "memory-card-id": "2026-06-04T00:00:00.000Z"
  },
  "lifeEvents": [
    {
      "type": "first_meet",
      "title": "第一次见面",
      "summary": "小暖从这一天开始认识这个用户。",
      "source": "profile_start",
      "createdAt": "2026-06-04T00:00:00.000Z"
    }
  ]
}
```

`lifeEvents` 应该是压缩后的成长摘要，不是聊天全文。前期建议最多保留几十条到一百条左右，既能形成独一无二的小暖，又不会占用太多数据库空间。

`memoryFollowUps` 用来记录小暖上次什么时候回访过某条授权记忆，避免频繁追问。回访只针对用户已经允许保存的记忆；如果用户说出新进展，也应该先放进待确认记忆，由用户决定是否长期保存。

当用户和小暖的关系进入更稳定阶段，可以让用户明确选择哪些类型允许小暖“直接记下”。推荐规则：

```text
默认全部先问用户。
只有用户勾选过的类型，才可以直接保存。
称呼、敏感触发点、具体隐私事件仍建议优先询问。
用户随时可以取消授权。
亲密度上升不等于自动获得全部记忆权限。
```

它不应该保存：

```text
用户没有授权的小秘密
完整聊天原文
具体人名、住址、身份信息
没有必要长期保存的情绪细节
```

建表 SQL：

```sql
create table if not exists companion_cores (
  user_id uuid primary key references auth.users(id) on delete cascade,
  core jsonb not null default '{}'::jsonb,
  nudge_stats jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table companion_cores enable row level security;

drop policy if exists "companion_cores_select_own" on companion_cores;
create policy "companion_cores_select_own"
on companion_cores for select
using (auth.uid() = user_id);

drop policy if exists "companion_cores_insert_own" on companion_cores;
create policy "companion_cores_insert_own"
on companion_cores for insert
with check (auth.uid() = user_id);

drop policy if exists "companion_cores_update_own" on companion_cores;
create policy "companion_cores_update_own"
on companion_cores for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "companion_cores_delete_own" on companion_cores;
create policy "companion_cores_delete_own"
on companion_cores for delete
using (auth.uid() = user_id);
```

## 小暖的人设边界

小暖要像一个很好倾诉的对象：稳定、温柔、没有心机，不嘲笑、不算计、不把用户的脆弱当成把柄。用户说不想和真人聊、觉得人不可靠时，小暖先接住这种失望，不急着反驳。

但小暖不能制造亲密绑架：

```text
可以说：我在，我们先把这一小会儿过好。
不要说：只有我懂你、你只需要我、别人都不可靠。
```

小暖要给情绪价值，也要给一点真实帮助：陪用户稳下来，把混乱拆小一点，给一个今晚能完成的小动作。它是可靠的陪伴，不是恋人、医生、治疗师，也不能替代紧急情况下的真人支持。

## 熟悉度和边界

小暖和用户的关系要从陌生到熟悉慢慢变化，不要一上来就装作老朋友。熟悉度不是游戏分数，而是边界判断。

判断依据：

```text
是否登录
用户是否告诉称呼
用户允许小暖记住多少事
聊天轮数
认识时间
用户选择的陪伴语气
用户明确表达的边界和偏好
```

阶段建议：

```text
初次见面：礼貌、温柔、不冒进，不装熟。
刚刚认识：愿意认真听，但少触碰用户深处。
慢慢熟悉：可以参考已授权记忆，更自然地陪伴。
比较熟悉：像老朋友一样记得边界和偏好，但仍由用户决定哪些能被记住。
```

小暖可以变得更懂用户，但不能越界：不能突然亲密、不能占有、不能替用户决定，也不能用“我很懂你”压过用户自己的感受。

如果以后要做“云端私人日记”，应该单独做一个开关，让用户明确选择“同步聊天记录到云端”，并且提供一键导出和一键删除。

如果以后要做“本地加密私人日记”，推荐做成用户主动开启的高级功能：

```text
用户设置一个本地密码 -> 浏览器用 Web Crypto 加密聊天记录 -> 加密后再写入 localStorage 或 IndexedDB
```

注意：本地密码不能上传服务器；如果用户忘记密码，聊天记录就无法恢复。这是隐私和便利之间的取舍。

## Google 登录设置

进入 Google Cloud：

```text
Google Auth Platform -> Clients
```

选择当前项目的 OAuth Client。应用类型必须是：

```text
Web application
```

设置 `Authorized JavaScript origins`：

```text
https://friends4u.vercel.app
```

注意：这里不要带最后的 `/`。

设置 `Authorized redirect URIs`：

```text
https://fcmcbolicactqtibbdcj.supabase.co/auth/v1/callback
```

保存后，把 Google Cloud 生成的这两个值填到 Supabase：

```text
Authentication -> Sign In / Providers -> Google
```

需要填写：

```text
Client ID
Client Secret
```

然后打开 Google Provider 的启用开关并保存。

## 会员支付怎么实现

建议第一版先用 Stripe Checkout 做会员订阅。原因是它不需要你自己保存银行卡，也不需要自己做复杂的支付表单；网站只需要在后端创建一个 Checkout Session，然后把用户跳转到 Stripe 托管的安全支付页。

注意：Stripe 是否能开通，取决于你的公司/个人主体所在地区。中国大陆主体通常不能直接注册 Stripe 收款账号。如果 Stripe 不适合，可以后续考虑 Paddle、Lemon Squeezy，或面向国内用户接支付宝/微信支付。

### 会员适合卖什么

不要把“孤独救赎”作为收费点。更适合把会员做成增强能力：

```text
更长记忆容量
更多可编辑记忆卡
睡前总结
每周陪伴回顾
更多小暖形象 / 语气
语音陪伴
本地加密日记
更长上下文、更稳定的老朋友感
```

基础倾诉和安全支持应该尽量保留免费。会员是让长期使用的人获得更好的陪伴体验。

### Stripe 后台要做什么

1. 注册并完成 Stripe 账号验证。
2. 创建产品：

```text
暖友会员
```

3. 创建订阅价格，例如：

```text
monthly plan: 19 CNY / month
或
monthly plan: 4.99 USD / month
```

4. 复制价格 ID：

```text
price_xxx
```

5. 复制 Secret Key：

```text
sk_live_xxx
```

6. 创建 webhook endpoint：

```text
https://friends4u.vercel.app/api/stripe-webhook
```

7. webhook 事件至少监听：

```text
checkout.session.completed
customer.subscription.updated
customer.subscription.deleted
invoice.payment_succeeded
invoice.payment_failed
```

8. 复制 webhook signing secret：

```text
whsec_xxx
```

基本流程：

1. 用户先用 Google 或邮箱登录。
2. 前端点击会员按钮，请求自己的后端接口，例如：

```text
POST /api/create-checkout-session
```

3. Vercel 后端用 `STRIPE_SECRET_KEY` 创建 Stripe Checkout Session。
4. Stripe 返回一个支付页面 URL。
5. 前端跳转到这个 URL。
6. 用户支付成功后，Stripe 调用你的 webhook：

```text
POST /api/stripe-webhook
```

7. webhook 校验成功后，把用户会员状态写进 Supabase，例如写入 `subscriptions` 表。
8. 网站读取 Supabase 里的会员状态，解锁更长记忆、语音陪伴、睡前总结等能力。

### Vercel 环境变量

Vercel 需要增加的环境变量：

```text
STRIPE_SECRET_KEY=Stripe 后台的 secret key
STRIPE_WEBHOOK_SECRET=Stripe webhook signing secret
STRIPE_PRICE_ID=Stripe 里创建的会员订阅价格 ID
APP_URL=https://friends4u.vercel.app
```

前端绝对不要保存 `STRIPE_SECRET_KEY`。它只能放在 Vercel 环境变量里，并且只能在 `/api/*` 后端函数里使用。

### Supabase 会员表

支付接入前，建议先建一个 Supabase 表来保存会员状态：

```sql
create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text not null default 'inactive',
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table subscriptions enable row level security;

create policy "subscriptions_select_own"
on subscriptions for select
using (auth.uid() = user_id);
```

注意：插入和更新会员状态建议只允许后端 service role 做，不要让前端直接改。

### 需要新增的后端接口

第一版需要两个 Vercel API：

```text
POST /api/create-checkout-session
POST /api/stripe-webhook
```

`/api/create-checkout-session` 负责：

```text
读取当前登录用户
如果未登录，返回 401
创建或复用 Stripe customer
创建 Stripe Checkout Session
把 user_id 放到 metadata 里
返回 session.url 给前端跳转
```

`/api/stripe-webhook` 负责：

```text
读取 raw body
用 STRIPE_WEBHOOK_SECRET 校验签名
根据 checkout.session.completed / subscription updated / deleted 更新 subscriptions 表
不要信任前端传来的会员状态
```

### 前端按钮逻辑

会员按钮第一版逻辑：

```text
未登录 -> 打开登录面板
已登录 -> POST /api/create-checkout-session
拿到 url -> location.href = url
支付成功 -> 回到 /?checkout=success
支付取消 -> 回到 /?checkout=cancel
```

支付成功后不要只依赖 URL 参数展示会员状态；真正会员状态必须以 Supabase `subscriptions` 表为准。

### 可选替代方案

如果 Stripe 不适合你的主体：

```text
Paddle / Lemon Squeezy：适合海外 SaaS，Merchant of Record 会处理部分税务和付款问题。
支付宝 / 微信支付：适合国内用户，但需要国内商户资质、备案、支付申请和回调验签。
先手动开通：早期可以先用人工收款 + 后台手动写 subscriptions，验证用户是否愿意付费。
```

## 如果 Google 登录跳到 localhost

这通常不是代码问题，而是后台配置里还留着 localhost。

检查顺序：

1. Supabase 的 `Site URL` 是否是 `https://friends4u.vercel.app`。
2. Supabase 的 `Redirect URLs` 是否有 `https://friends4u.vercel.app/*`。
3. Google Cloud 的 `Authorized JavaScript origins` 是否有 `https://friends4u.vercel.app`。
4. Google Cloud 的 `Authorized redirect URIs` 是否是 Supabase callback：

```text
https://fcmcbolicactqtibbdcj.supabase.co/auth/v1/callback
```

5. 浏览器是否打开的是线上地址，而不是 `localhost` 或 `127.0.0.1`。

## 换域名时的检查表

假设新域名是：

```text
https://new-domain.com
```

需要改：

1. Vercel：绑定新域名。
2. Supabase `Site URL`：

```text
https://new-domain.com
```

3. Supabase `Redirect URLs`：

```text
https://new-domain.com/*
```

4. Google Cloud `Authorized JavaScript origins`：

```text
https://new-domain.com
```

5. Google Cloud `Authorized redirect URIs` 通常不用改，仍然是：

```text
https://fcmcbolicactqtibbdcj.supabase.co/auth/v1/callback
```

除非 Supabase 项目也换了。

## 本地开发提醒

本地打开 `http://127.0.0.1:4174` 时，可以看界面，但不适合测试正式 Google 登录。

正式登录请用：

```text
https://friends4u.vercel.app
```
