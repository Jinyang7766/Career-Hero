
def get_batch1_data():
    return [
        # --- Batch 1: Specialist Mid/Junior (20 items) ---
        # 1. E-commerce
        {
            "id": "ecom_trad_mid", "seniority": "mid", "is_ai_enhanced": False,
            "industry": "跨境电商", "job_role": "跨境电商运营",
            "skills": ["ASIN诊断", "ACOS压降", "FBA库存规划", "Listing埋词", "竞品跟卖监控"],
            "star": {
                "situation": "旺季前夕遭遇竞品恶意低价跟卖，核心ASIN丢失购物车长达3天，且因备货激进导致FBA库龄超90天滞销品积压1500件。",
                "task": "抢夺购物车控制权并清理滞销库存，同时将ACOS控制在盈亏平衡点以下。",
                "action": "启动自动调价规则每5分钟扫描一次竞品底价；通过站外Deal与捆绑促销（Bundles）强力清仓；重构Listing五点描述，埋入长尾词根以避开红海竞争。",
                "result": "72小时内夺回BuyBox，滞销库存动销率提升至85.4%，Listing转化率从3.2%拉升至8.7%，成功将ACOS从45%压降至14.2%。"
            },
            "resume_bullets": [
                "针对竞品恶意跟卖，启用自动调价与站外Bundles清仓，72小时内夺回BuyBox。",
                "清理FBA库龄超90天滞销品，动销率提升至85.4%。",
                "重构Listing埋入长尾词，将ACOS从45%压降至14.2%。"
            ]
        },
        {
            "id": "ecom_ai_mid", "seniority": "mid", "is_ai_enhanced": True,
            "industry": "跨境电商", "job_role": "跨境电商AI运营",
            "skills": ["Midjourney素材生成", "ChatGPT文案优化", "自动化PPC", "库存预测模型", "竞品爬虫"],
            "star": {
                "situation": "新品推广期面临素材同质化严重，CTR仅0.8%，且人工选词无法覆盖新兴流量词，导致广告预算空耗。",
                "task": "利用AI技术突破素材瓶颈并实现精准长尾引流。",
                "action": "训练垂直品类LoRA模型批量生成200+场景化主图；利用Python抓取竞品Review并通过NLP分析用户痛点；部署自动化脚本实时调整4000+个广告词出价。",
                "result": "主图点击率(CTR)飙升至3.4%，自然流量占比提升42.5%，新品推广周期缩短14天，ROAS实现从1.8到5.6的跨越。"
            },
            "resume_bullets": [
                "训练LoRA模型批量生成场景图，Click-Through Rate (CTR) 飙升至3.4%。",
                "部署自动化脚本实时竞价4000+关键词，ROAS从1.8跃升至5.6。",
                "利用NLP分析痛点优化文案，新品推广自然流量占比提升42.5%。"
            ]
        },
        # 2. Audit
        {
            "id": "audit_trad_mid", "seniority": "mid", "is_ai_enhanced": False,
            "industry": "财务审计", "job_role": "财务审计",
            "skills": ["底稿编制", "凭证抽查", "存货盘点", "银行函证", "勾稽关系复核"],
            "star": {
                "situation": "年审期间发现子公司存在大量未入账跨期费用，且手工账目与ERP系统余额差异达142万元，财务总监离职导致线索中断。",
                "task": "在两周内查清差异原因并完成调整分录，确保无保留意见报告出具。",
                "action": "对该子公司3000+笔银行流水进行逐笔手工穿行测试；实地盘点三个异地仓库并核对出入库单据；与供应商进行二轮函证比对差异。",
                "result": "成功追回未入账发票128张，调整后账实不符金额降至0.05万元以内，提前3天完成审计底稿归档。"
            },
            "resume_bullets": [
                "手工穿行测试3000+笔流水，追回未入账跨期费用128笔。",
                "实地盘点异地仓库并核对函证，将账实差异从142万降至0.05万。",
                "应对财务总监离职危机，提前3天完成审计底稿归档。"
            ]
        },
        {
            "id": "audit_ai_mid", "seniority": "mid", "is_ai_enhanced": True,
            "industry": "财务审计", "job_role": "AI审计分析师",
            "skills": ["OCR票据识别", "异常交易算法", "Python数据清洗", "自动化底稿", "风险热力图"],
            "star": {
                "situation": "面对集团20万+笔年度分录，传统随机抽样（5%）无法有效识别隐蔽的利益输送风险，且关联方交易错综复杂。",
                "task": "利用技术手段实现全量审计，精准定位舞弊风险。",
                "action": "编写SQL脚本对全量日记账进行本福特定律（Benford's Law）分析；利用图算法构建关联方资金流向拓扑图；训练孤立森林模型识别异常报销行为。",
                "result": "筛查出17笔隐蔽的高风险关联交易，异常样本定位准确率达94.3%，审计覆盖率从5%提升至100%，节约审计工时340小时。"
            },
            "resume_bullets": [
                "编写SQL本福特定律脚本筛查20万分录，定位17笔高风险关联交易。",
                "构建资金流向图谱，关联方隐蔽利益输送识别率94.3%。",
                "审计全覆盖率从5%提升至100%，节约工时340小时。"
            ]
        },
        # 3. Product Manager
        {
            "id": "pm_trad_mid", "seniority": "mid", "is_ai_enhanced": False,
            "industry": "互联网", "job_role": "产品经理",
            "skills": ["PRD撰写", "Axure原型", "竞品调研", "需求评审", "埋点分析"],
            "star": {
                "situation": "B端SaaS系统的审批流模块逻辑极其复杂，因历史包袱导致每加一个字段需开发3天，客户投诉积压超过50单。",
                "task": "重构审批流配置中心，实现业务方自助配置，降低研发介入成本。",
                "action": "梳理500+个配置项并抽象出“条件+动作”原子模型；设计可视化流程编排器替代硬编码；推动前后端分离改造以解耦业务逻辑。",
                "result": "新需求上线周期从3天缩短至0.5小时，客户配置错误率降低88.5%，系统扩展性评分提升4.2分。"
            },
            "resume_bullets": [
                "抽象“条件+动作”原子模型重构配置中心，配置错误率降低88.5%。",
                "设计可视化编排器替代硬编码，需求上线周期从3天缩至0.5小时。",
                "推动前后端分离改造，系统扩展性评分提升4.2分。"
            ]
        },
        {
            "id": "pm_ai_mid", "seniority": "mid", "is_ai_enhanced": True,
            "industry": "互联网", "job_role": "AI产品经理",
            "skills": ["RAG应用设计", "Prompt工程", "Agent编排", "模型微调", "向量库选型"],
            "star": {
                "situation": "智能客服机器人的回答机械重复，对于复杂意图理解准确率低于60%，导致转人工率居高不下，运营成本激增。",
                "task": "引入大模型技术重塑客服体验，大幅降低人工介入。",
                "action": "构建包含2万条行业知识的向量知识库；设计ReAct范式的Agent以调用订单系统API查询状态；通过SFT微调基座模型以对齐品牌话术风格。",
                "result": "意图识别准确率提升至96.2%，复杂问题解决率达78%，单月节省人工客服成本12.5万元。"
            },
            "resume_bullets": [
                "构建2万条向量知识库赋能客服Bot，意图识别率提升至96.2%。",
                "微调基座模型对齐品牌话术，复杂问题解决率达78%。",
                "设计ReAct Agent自动调用API，单月节省客服成本12.5万。"
            ]
        },
        # 4. New Media
        {
            "id": "media_trad_jun", "seniority": "junior", "is_ai_enhanced": False,
            "industry": "新媒体", "job_role": "新媒体运营",
            "skills": ["选题策划", "脚本撰写", "私域引流", "热点追踪", "数据复盘"],
            "star": {
                "situation": "公众号打开率跌破1.2%，粉丝增长停滞，且因错过“双减”政策热点导致一篇精心准备的推文阅读量仅300+。",
                "task": "激活僵尸粉并打造一篇10万+爆款，扭转账号颓势。",
                "action": "深度挖掘用户痛点策划“职场焦虑”系列选题；建立500人核心粉丝群进行标题A/B测试；在知乎、小红书进行矩阵式分发引流。",
                "result": "策划出单篇阅读量10万+爆文，账号一周内涨粉1.4万，粉丝活跃度提升至8.5%，广告报价翻倍。"
            },
            "resume_bullets": [
                "策划“职场焦虑”系列选题，单篇阅读破10万，一周涨粉1.4万。",
                "通过核心粉群A/B测试标题，粉丝活跃度提升至8.5%。",
                "建立矩阵分发机制，账号广告报价实现翻倍。"
            ]
        },
        {
            "id": "media_ai_jun", "seniority": "junior", "is_ai_enhanced": True,
            "industry": "新媒体", "job_role": "AI内容运营",
            "skills": ["Midjourney绘图", "Stable Diffusion", "数字人直播", "批量混剪", "AI文案"],
            "star": {
                "situation": "短视频矩阵号每天需产出50条内容，人工剪辑团队已连续加班一个月，产能达到极限，且素材重复度高导致被平台限流。",
                "task": "搭建自动化内容工厂，在不增加人手的情况下产能翻倍。",
                "action": "搭建ComfyUI工作流实现视频画面自动重绘；利用GPT-4批量生成分镜脚本；部署数字人播报替代真人出镜。",
                "result": "日均内容产出量提升至120条，单条视频制作成本降低92%，账号矩阵总播放量增长340%，违规率降至0.1%以下。"
            },
            "resume_bullets": [
                "搭建ComfyUI工作流，视频日产能从50条提升至120条。",
                "利用GPT-4批量生成脚本，制作成本降低92%。",
                "部署数字人矩阵，总播放量增长340%，违规率控在0.1%以下。"
            ]
        },
        # 5. Supply Chain
        {
            "id": "supply_trad_mid", "seniority": "mid", "is_ai_enhanced": False,
            "industry": "制造", "job_role": "供应链计划",
            "skills": ["MRP运算", "安全库存", "缺货跟进", "VMI管理", "订单交付"],
            "star": {
                "situation": "核心芯片供应商突然宣布延长交期至52周，导致Q4主打产品面临停产风险，且替代料验证流程尚未启动。",
                "task": "紧急寻找替代资源并调整生产计划，确保Q4订单交付率不低于95%。",
                "action": "锁定现货市场资源并溢价采购建立战略缓冲库；协调研发部门开启“特采”通道加速替代料验证；调整排产计划优先保障高毛利SKU。",
                "result": "避免了产线停工危机，Q4订单交付率达成98.2%，虽然采购成本上升12%，但保住了核心大客户份额。"
            },
            "resume_bullets": [
                "面对52周交期危机，锁定现货资源保障Q4交付率98.2%。",
                "开启研发替代料“特采”通道，避免产线停工。",
                "即便采购成本上升12%（战略缓冲），仍通过排产优化保住了核心高毛利份额。"
            ]
        },
        {
            "id": "supply_ai_mid", "seniority": "mid", "is_ai_enhanced": True,
            "industry": "制造", "job_role": "AI供应链",
            "skills": ["需求预测算法", "智能补货", "物流路径优化", "动态定价", "供应链孪生"],
            "star": {
                "situation": "受市场波动影响，长周期物料库存周转天数高达180天，资金占用严重，而短周期物料却频频缺货。",
                "task": "利用算法优化库存结构，平衡服务水平与资金成本。",
                "action": "训练时序预测模型（Prophet）替代人工Excel拍脑袋；实施动态安全库存策略；构建多级库存优化网络（IO）模型。",
                "result": "库存周转天数优化至85天，缺货率即时降至0.8%，在保持服务水平不变的情况下释放现金流420万元。"
            },
            "resume_bullets": [
                "应用Prophet时序模型优化库存，周转天数从180天降至85天。",
                "构建多级库存IO模型，释放现金流420万元。",
                "将缺货率降至0.8%，同时保持服务水平不变。"
            ]
        },
        # 6. Backend
        {
            "id": "backend_trad_mid", "seniority": "mid", "is_ai_enhanced": False,
            "industry": "互联网", "job_role": "后端开发",
            "skills": ["Java/Go", "MySQL调优", "Redis缓存", "消息队列", "微服务"],
            "star": {
                "situation": "大促期间秒杀接口QPS激增至5万，数据库CPU飙升至100%，导致订单服务雪崩，大量用户支付失败。",
                "task": "紧急扩容并优化热点数据访问，恢复服务可用性。",
                "action": "实施Redis集群扩容并开启热Key读写分离；对热点SKU库存扣减采用Lua脚本原子操作；紧急降级非核心服务以释放资源。",
                "result": "系统在15分钟内恢复稳定，抗住了后续8万QPS的峰值冲击，数据一致性保持100%，无超卖现象。"
            },
            "resume_bullets": [
                "应对5万QPS秒杀洪峰，实施Redis热Key读写分离，15分钟恢复服务。",
                "采用Lua脚本原子化扣减库存，实现0超卖。",
                "紧急降级非核心服务，抗住后续8万QPS冲击。"
            ]
        },
        {
            "id": "backend_ai_mid", "seniority": "mid", "is_ai_enhanced": True,
            "industry": "互联网", "job_role": "SRE工程师",
            "skills": ["AIOps", "混沌工程", "自动化运维", "根因分析", "全链路监控"],
            "star": {
                "situation": "分布式系统链路复杂，故障定位平均耗时45分钟，且误报率高，运维人员疲于奔命。",
                "task": "构建智能监控体系，实现故障的秒级发现与分钟级自愈。",
                "action": "部署eBPF技术无侵入采集全链路数据；利用机器学习算法训练异常检测模型；构建故障自愈（Self-healing）脚本库。",
                "result": "故障平均修复时间（MTTR）从45分钟压缩至3分钟，告警准确率提升至97.5%，系统可用性提升至99.99%。"
            },
            "resume_bullets": [
                "部署eBPF采集无侵入监控，故障自愈率达97.5%。",
                "利用ML模型检测异常，MTTR从45分钟压缩至3分钟。",
                "构建自动化运维脚本库，系统可用性提升至99.99%。"
            ]
        },
        # 7. Healthcare
        {
            "id": "health_trad_mid", "seniority": "mid", "is_ai_enhanced": False,
            "industry": "医疗", "job_role": "医疗运营",
            "skills": ["病床统筹", "医患沟通", "流程优化", "科室协作", "满意度管理"],
            "star": {
                "situation": "门诊高峰期候诊时间平均长达3小时，患者投诉引发医患纠纷，且专家号源被“黄牛”垄断。",
                "task": "优化门诊就医流程，缩短候诊时间并打击号源倒卖。",
                "action": "实施分时段预约就诊制；调整导诊台布局优化动线；建立黑名单机制识别高频异常挂号行为。",
                "result": "平均候诊时间降至45分钟，患者满意度评分从3.5分提升至4.8分，有效拦截“黄牛”账号300余个。"
            },
            "resume_bullets": [
                "实施分时段预约，门诊候诊时间从3小时降至45分钟。",
                "建立黑名单机制拦截300+黄牛账号，满意度升至4.8分。",
                "优化导诊动线，有效缓解高峰期拥堵。"
            ]
        },
        {
            "id": "health_ai_mid", "seniority": "mid", "is_ai_enhanced": True,
            "industry": "医疗", "job_role": "数字医疗运营",
            "skills": ["CDSS应用", "患者画像", "智能随访", "医疗NLP", "预约算法"],
            "star": {
                "situation": "慢病患者出院后缺乏有效管理，复发率高，随访依靠人工电话效率极低，数据无法结构化。",
                "task": "搭建全病程智能管理平台，提升随访效率与患者依从性。",
                "action": "利用NLP从电子病历（EMR）自动提取关键指标；部署AI语音机器人进行标准化随访；算法自动生成个性化健康宣教内容。",
                "result": "随访覆盖率从30%提升至100%，患者依从性提升45%，主要慢病复发再入院率降低18.5%。"
            },
            "resume_bullets": [
                "利用NLP提取EMR指标，随访覆盖率100%。",
                "部署AI语音机器人，患者依从性提升45%。",
                "算法生成个性化宣教，慢病复发再入院率降低18.5%。"
            ]
        },
        # 8. Real Estate
        {
            "id": "realestate_trad_mid", "seniority": "mid", "is_ai_enhanced": False,
            "industry": "房地产", "job_role": "房产策划",
            "skills": ["案场活动", "渠道拓客", "销售逼单", "竞品分析", "销控管理"],
            "star": {
                "situation": "项目位置偏远，导致自然到访量极低，且竞品启动“以价换量”策略，导致我方周去化仅2套。",
                "task": "通过差异化营销突围，提升案场到访与成交。",
                "action": "策划“全城寻找锦鲤”事件营销引爆话题；整合周边企业资源开展团购专场；制定“首付分期”政策降低准入门槛。",
                "result": "活动期间到访量激增400%，单月成交58套，逆势成为区域销冠，溢价率保持在5%以上。"
            },
            "resume_bullets": [
                "策划事件营销引爆话题，到访量逆势激增400%。",
                "整合企业团购资源，单月成交58套夺得销冠。",
                "制定“首付分期”政策，溢价率保持5%以上。"
            ]
        },
        {
            "id": "realestate_ai_mid", "seniority": "mid", "is_ai_enhanced": True,
            "industry": "房地产", "job_role": "房产数据分析",
            "skills": ["客源预测", "智能定价", "精准投放", "VR看房", "线索评分"],
            "star": {
                "situation": "很多线索是无效号码或未有购房意向，置业顾问每天打100个电话仅1个有效，导致士气低落，营销费用浪费严重。",
                "task": "利用大数据清洗线索，实现精准营销。",
                "action": "建立客户数据平台（CDP）整合线上线下轨迹；构建购房意向预测模型（Propensity Model）；基于LBS数据进行精准朋友圈广告投放。",
                "result": "线索有效率从1%提升至15%，获客成本（CPL）降低65%，置业顾问人均效能提升3倍。"
            },
            "resume_bullets": [
                "构建CDP清洗数据，线索有效率从1%提升至15%。",
                "利用LBS精准投放，CPL成本降低65%。",
                "建立购房意向预测模型，置业顾问人效提升3倍。"
            ]
        },
        # 9. Data Analyst
        {
            "id": "data_trad_mid", "seniority": "mid", "is_ai_enhanced": False,
            "industry": "数据分析", "job_role": "数据分析师",
            "skills": ["SQL", "Tableau", "指标体系", "异动分析", "周报自动化"],
            "star": {
                "situation": "运营部门每天提出20+临时提数需求，且各业务线对“活跃用户”定义不一致，导致数据打架。",
                "task": "统一数据口径并搭建自助BI看板，解放分析人力。",
                "action": "召开3轮指标定义研讨会拉齐口径；搭建数据中间表（DW）提升查询效率；开发Tableau仪表盘涵盖核心KPI。",
                "result": "临时提数需求减少80%，核心指标产出时间从T+1提前至T+0实时，数据信任度显著回升。"
            },
            "resume_bullets": [
                "统一各线数据定义，临时提数需求减少80%。",
                "搭建自助BI看板，核心指标T+0实时产出。",
                "建立中间表提升查询性能，重建数据信任。"
            ]
        },
        {
            "id": "data_ai_mid", "seniority": "mid", "is_ai_enhanced": True,
            "industry": "数据分析", "job_role": "数据挖掘工程师",
            "skills": ["机器学习", "因果推断", "特征工程", "PySpark", "数据治理"],
            "star": {
                "situation": "电商平台用户流失严重，传统RFM模型无法识别流失征兆，挽回策略千篇一律效果差。",
                "task": "构建流失预警模型，辅助运营进行精细化干预。",
                "action": "挖掘用户点击流与搜索行为特征；训练XGBoost分类模型预测未来7天流失概率；利用SHAP值解释流失原因并推荐干预手段。",
                "result": "高风险流失用户召回率提升24.6%，预警模型AUC达0.88，挽回潜在GMV损失300万元/月。"
            },
            "resume_bullets": [
                "训练XGBoost流失预警模型，AUC达0.88。",
                "利用SHAP值归因流失，召回率提升24.6%。",
                "实施精细化干预，挽回GMV损失300万/月。"
            ]
        },
        # 10. QA Engineer
        {
            "id": "qa_trad_mid", "seniority": "mid", "is_ai_enhanced": False,
            "industry": "IT互联网", "job_role": "测试工程师",
            "skills": ["功能测试", "Jira", "Fiddler", "用例设计", "Bug管理"],
            "star": {
                "situation": "上线前夕发现核心支付链路偶发性报错，开发推脱是网络问题，且回归测试需手动执行500+用例，时间紧迫。",
                "task": "定位偶发Bug根因并确保上线质量。",
                "action": "使用Charles弱网模拟复现问题；通过日志分析锁定第三方SDK回调超时；组织“Bug Bash”集中扫雷。",
                "result": "准确定位并修复了并发锁死问题，手动回归测试覆盖率100%，版本按时上线且零回退。"
            },
            "resume_bullets": [
                "使用Charles弱网模拟复现偶发Bug，避免版本回退。",
                "组织Bug Bash集中扫雷，手动回归覆盖率100%。",
                "拦截第三方SDK回调超时问题，保障上线零故障。"
            ]
        },
        {
            "id": "qa_ai_mid", "seniority": "mid", "is_ai_enhanced": True,
            "industry": "IT互联网", "job_role": "测试开发",
            "skills": ["Selenium", "CI/CD", "代码覆盖率", "自动化框架", "性能压测"],
            "star": {
                "situation": "微服务架构下接口达数千个，每次迭代回归耗时3天，严重拖慢发布节奏，且人工漏测率逐月上升。",
                "task": "搭建自动化测试平台，实现CICD流水线自动卡点。",
                "action": "开发基于Pytest的接口自动化框架；实现测试数据自动构造与清理；集成Jenkins实现代码提交即触发测试。",
                "result": "核心流程自动化覆盖率达92%，回归测试时间压缩至15分钟，版本拦截严重Bug 12个。"
            },
            "resume_bullets": [
                "开发Pytest自动化框架，回归时间从3天缩至15分钟。",
                "集成Jenkins流水线，核心流程覆盖率达92%。",
                "自动化拦截12个严重Bug，显著提升发布质量。"
            ]
        },

        # --- Batch 2: Specialist Senior (20 items) ---
        # 11. Architect
        {
            "id": "arch_trad_senior", "seniority": "senior", "is_ai_enhanced": False,
            "industry": "互联网", "job_role": "架构师",
            "skills": ["DDD领域驱动", "SpringCloud", "JVM调优", "分库分表", "异地多活"],
            "star": {
                "situation": "核心交易系统由于长达5年的业务堆砌，形成“大泥球”单体架构，代码行数超200万，每次发版导致停机维护4小时。",
                "task": "基于DDD进行微服务拆分，实现系统平滑演进与零停机发布。",
                "action": "划定界限上下文（Bounded Context）剥离12个微服务；引入Canary发布机制控制爆炸半径；实施ShardingSphere分库分表解决单表5亿数据瓶颈。",
                "result": "发布频率从月度提升至每日，P99延迟降低300ms，支撑起日均千万级订单交易。"
            },
            "resume_bullets": [
                "剥离12个微服务，实现核心交易系统零停机发布。",
                "实施ShardingSphere分库分表，解决5亿数据性能瓶颈。",
                "引入Canary发布，P99延迟降低300ms。"
            ]
        },
        {
            "id": "arch_ai_senior", "seniority": "senior", "is_ai_enhanced": True,
            "industry": "互联网", "job_role": "AI架构师",
            "skills": ["ModelOps", "GPU集群调度", "LangChain", "TensorRT", "私有化部署"],
            "star": {
                "situation": "百亿参数模型推理成本极高（单次$0.01），且并发请求下GPU显存碎片化严重，导致推理延迟波动大。",
                "task": "构建高性能推理服务，极致降低推理成本与延迟。",
                "action": "应用vLLM库优化PageAttention显存管理；实施INT8量化与算子融合（Operator Fusion）；基于K8s构建弹性GPU资源池。",
                "result": "推理吞吐量（Throughput）提升4.5倍，首字延迟（TTFT）降低至200ms以内，GPU资源利用率从30%提升至85%。"
            },
            "resume_bullets": [
                "应用vLLM优化PageAttention，GPU利用率从30%提升至85%。",
                "实施INT8量化，推理成本降低4.5倍。",
                "首字延迟(TTFT)压降至200ms内，支撑高并发请求。"
            ]
        },
        # 12. Algo Expert
        {
            "id": "algo_trad_senior", "seniority": "senior", "is_ai_enhanced": False,
            "industry": "人工智能", "job_role": "算法专家",
            "skills": ["Wide&Deep", "特征交叉", "TensorFlow", "LTR排序", "召回算法"],
            "star": {
                "situation": "信息流推荐系统长尾内容曝光不足，头部效应显著，导致用户疲劳，次日留存率连续3个月下跌。",
                "task": "优化排序模型，平衡CTR与多样性（Diversity）。",
                "action": "引入MMoE多任务学习框架兼顾点击与时长；构建用户负反馈序列特征；在重排层增加DPP（行列式点过程）打散策略。",
                "result": "用户人均使用时长增加12.8分钟，长尾内容分发占比提升35%，次日留存率止跌回升2.4个百分点。"
            },
            "resume_bullets": [
                "引入MMoE多任务框架，次日留存率回升2.4%。",
                "增加DPP打散策略，长尾内容分发占比提升35%。",
                "构建负反馈序列，人均时长增加12.8分钟。"
            ]
        },
        {
            "id": "algo_ai_senior", "seniority": "senior", "is_ai_enhanced": True,
            "industry": "人工智能", "job_role": "大模型算法专家",
            "skills": ["RLHF", "PEFT微调", "Deepspeed", "Prompt Tuning", "多模态对齐"],
            "star": {
                "situation": "通用开源模型在法律垂直领域幻觉率高达40%，无法生成可用的法律文书，且微调数据稀缺。",
                "task": "训练法律行业垂类大模型，确保生成内容的专业性。",
                "action": "构建包含50万份判决书的高质量SFT指令集；设计DPO（直接偏好优化）算法替代复杂的RLHF；利用RAG增强检索最新法条。",
                "result": "法律文书生成可用率达92%，幻觉率降至5%以内，在LawBench评测中超越GPT-3.5水平。"
            },
            "resume_bullets": [
                "构建50万指令集SFT，法律文书可用率达92%。",
                "设计DPO算法替代RLHF，幻觉率降至5%。",
                "RAG增强检索，LawBench评测超越GPT-3.5。"
            ]
        },
        # 13. Clinical
        {
            "id": "clinical_trad_senior", "seniority": "senior", "is_ai_enhanced": False,
            "industry": "医疗", "job_role": "主任医师",
            "skills": ["疑难手术", "MDT会诊", "临床路径", "SCI论文", "科室管理"],
            "star": {
                "situation": "科室收治的III/IV期肿瘤患者五年生存率徘徊在35%，常规化疗方案耐药率高，患者生存质量差。",
                "task": "突破晚期肿瘤治疗瓶颈，提升生存率与科室学术影响力。",
                "action": "建立多学科诊疗（MDT）常态化机制；开展3项新辅助免疫治疗临床试验；引进达芬奇机器人开展微创手术。",
                "result": "晚期患者五年生存率提升至48%，III/IV级手术占比提升20%，发表高影响因子SCI论文5篇。"
            },
            "resume_bullets": [
                "建立常态化MDT机制，晚期生存率提升至48%。",
                "引进机器人微创手术，III/IV级手术占比升20%。",
                "开展临床试验，发表5篇高分SCI。"
            ]
        },
        {
            "id": "clinical_ai_senior", "seniority": "senior", "is_ai_enhanced": True,
            "industry": "医疗", "job_role": "数字医学专家",
            "skills": ["手术机器人", "影像组学", "临床DSS", "多组学分析", "数字疗法"],
            "star": {
                "situation": "病理科医生严重短缺，每张切片阅片耗时20分钟，导致病理报告平均延迟3天出具，延误治疗。",
                "task": "开发病理AI辅助诊断系统，实现秒级初筛。",
                "action": "标注10万张全切片图像（WSI）训练深度学习模型；开发基于MIL（多示例学习）的弱监督算法解决标注噪声；集成至显微镜端。",
                "result": "AI辅助下阅片速度提升6倍，微小病灶检出灵敏度达98%，病理报告出具时间缩短至24小时。"
            },
            "resume_bullets": [
                "标注10万WSI训练模型，阅片速度提升6倍。",
                "开发MIL弱监督算法，微小病灶检出率98%。",
                "病理报告出具时间缩短至24小时，延误率归零。"
            ]
        },
        # 14. Legal
        {
            "id": "legal_trad_senior", "seniority": "senior", "is_ai_enhanced": False,
            "industry": "法律", "job_role": "法务总监",
            "skills": ["IPO合规", "并购重组", "涉外诉讼", "风控体系", "合同谈判"],
            "star": {
                "situation": "公司拟在纳斯达克上市，但面临复杂的VIE架构重组风险及美国《外国公司问责法案》的严苛审计要求。",
                "task": "清除上市法律障碍，确保架构合规与数据安全。",
                "action": "主导VIE架构拆除与红筹重组路径设计；建立数据出境安全评估机制；与SEC及审计师进行多轮合规抗辩。",
                "result": "成功通过SEC问询并如期上市，规避了潜在的退市风险，节省外部律所费用300万美元。"
            },
            "resume_bullets": [
                "设计VIE拆除路径，成功通过SEC问询如期上市。",
                "建立数据出境评估机制，规避退市风险。",
                "多轮合规抗辩，节省外部律所费用300万美金。"
            ]
        },
        {
            "id": "legal_ai_senior", "seniority": "senior", "is_ai_enhanced": True,
            "industry": "法律", "job_role": "LegalTech专家",
            "skills": ["智能合约审计", "合规知识图谱", "自动化尽调", "案件预测", "隐私计算"],
            "star": {
                "situation": "跨国并购项目中，Data Room包含5万份非结构化合同，人工尽调需耗时3个月，极易错过交易窗口。",
                "task": "利用AI技术加速法律尽职调查（Due Diligence）。",
                "action": "部署NLP引擎自动提取“控制权变更”、“排他性条款”等风险点；利用知识图谱穿透多层股权结构；生成红旗风险报告。",
                "result": "尽调周期压缩至2周，识别出3处重大未披露隐形债务，为谈判争取到15%的估值下调空间。"
            },
            "resume_bullets": [
                "部署NLP提取风险点，尽调周期压缩至2周。",
                "穿透多层股权结构，识别3处未披露隐形债务。",
                "争取到15%估值下调空间，避免巨额交易损失。"
            ]
        },
        # 15. Semiconductor
        {
            "id": "semi_trad_senior", "seniority": "senior", "is_ai_enhanced": False,
            "industry": "半导体", "job_role": "工艺整合(PIE)",
            "skills": ["良率提升", "DOE实验", "失效分析", "SPC管控", "光刻工艺"],
            "star": {
                "situation": "14nm制程新产品量产良率（Yield）卡在65%无法突破，主要缺陷集中在Poly层线宽（CD）均一性差。",
                "task": "在3个月内将良率提升至90%的量产基准线。",
                "action": "设计全因子DOE实验寻找最佳光刻焦距与能量窗口；利用FIB切片进行物理失效分析；优化CMP研磨液配方改善平坦度。",
                "result": "攻克了线宽均一性难题，良率稳步爬升至92.5%，单片晶圆制造成本降低18%。"
            },
            "resume_bullets": [
                "设计DOE寻找最佳光刻窗口，攻克线宽均一性难题。",
                "优化CMP工艺，良率从65%爬升至92.5%。",
                "物理失效分析定位缺陷，单片成本降低18%。"
            ]
        },
        {
            "id": "semi_ai_senior", "seniority": "senior", "is_ai_enhanced": True,
            "industry": "半导体", "job_role": "AI芯片设计",
            "skills": ["EDA算法", "OPC光科修正", "良率预测", "布局布线", "虚拟量测"],
            "star": {
                "situation": "随着摩尔定律放缓，芯片物理设计（Layout）耗时呈指数级增长，人工布线难以兼顾PPA（性能、功耗、面积）最优解。",
                "task": "引入AI算法辅助芯片后端设计，打破设计墙。",
                "action": "利用强化学习（RL）代理进行自动化布局规划（Floorplan）；运用图神经网络（GNN）预测拥塞热点；部署AI驱动的DRC规则检查。",
                "result": "芯片主频提升5.2%，漏电流降低12%，设计迭代周期（TAT）缩短40%。"
            },
            "resume_bullets": [
                "利用RL代理自动化布局，设计迭代周期缩短40%。",
                "GNN预测拥塞热点，主频提升5.2%。",
                "AI驱动DRC检查，漏电流降低12%。"
            ]
        },
        # 16. Energy
        {
            "id": "energy_trad_senior", "seniority": "senior", "is_ai_enhanced": False,
            "industry": "能源", "job_role": "能源交易员",
            "skills": ["现货交易", "期货对冲", "仓储物流", "套利策略", "基本面分析"],
            "star": {
                "situation": "地缘政治冲突导致原油价格单日波动超10%，传统长协采购模式面临巨额浮亏风险。",
                "task": "优化采购组合与对冲策略，锁定能源成本。",
                "action": "利用布伦特原油期货构建裂解价差（Crack Spread）套利组合；锁定浮仓现货进行远期交割；动态调整长协与现货比例。",
                "result": "将采购成本锁定在市场均价下方8美元/桶，不仅对冲了2000万跌价损失，还实现额外套利收益500万。"
            },
            "resume_bullets": [
                "构建裂解价差套利组合，对冲2000万跌价损失。",
                "锁定浮仓现货，采购成本低于均价8美元/桶。",
                "动态调整长协比例，实现额外套利收益500万。"
            ]
        },
        {
            "id": "energy_ai_senior", "seniority": "senior", "is_ai_enhanced": True,
            "industry": "能源", "job_role": "量化能源交易",
            "skills": ["时序预测", "强化学习", "卫星数据分析", "算法交易", "风险VWAR"],
            "star": {
                "situation": "电力现货市场交易频次高达15分钟/次，人工决策无法处理海量气象、负荷与报价数据，导致偏差考核罚款高企。",
                "task": "构建AI自动报价系统，最大化发电收益。",
                "action": "融合卫星云图与数值天气预报预测光伏出力；利用LSTM模型预测日内超短期负荷；训练多智能体博弈模型生成最优报价策略。",
                "result": "日前电价预测准确率达94%，偏差考核费用降低85%，发电边际收益提升11.2%。"
            },
            "resume_bullets": [
                "融合卫星数据预测光伏出力，日前预测准确率94%。",
                "多智能体博弈生成报价，偏差考核费降低85%。",
                "LSTM预测超短期负荷，发电收益提升11.2%。"
            ]
        },
        # 17. Brand Director
        {
            "id": "brand_trad_senior", "seniority": "senior", "is_ai_enhanced": False,
            "industry": "营销", "job_role": "品牌总监",
            "skills": ["品牌定位", "危机公关", "整合营销", "VI体系", "媒体投放"],
            "star": {
                "situation": "品牌形象日益老化，被Z世代消费者贴上“油腻”标签，30岁以下用户占比不足15%。",
                "task": "实施品牌年轻化战役，重夺年轻用户心智。",
                "action": "联名二次元IP推出限量盲盒；策划“自黑式”病毒视频重塑品牌人设；全面焕新视觉识别系统（VI）拥抱扁平化。",
                "result": "全网曝光量超3亿，30岁以下用户占比大幅提升至42%，品牌NPS值提升15分。"
            },
            "resume_bullets": [
                "联名IP推限量盲盒，30岁以下用户占比升至42%。",
                "策划病毒视频重塑人设，全网曝光超3亿。",
                "焕新VI体系，品牌NPS值提升15分。"
            ]
        },
        {
            "id": "brand_ai_senior", "seniority": "senior", "is_ai_enhanced": True,
            "industry": "营销", "job_role": "数字品牌官",
            "skills": ["AIGC营销", "虚拟人IP", "情感计算", "全域归因", "自动化触点"],
            "star": {
                "situation": "传统TVC广告制作成本高（百万级）且周期长（3个月），无法适应社交媒体碎片化、实时化的内容需求。",
                "task": "利用生成式AI重构内容生产流，实现降本增效。",
                "action": "打造品牌专属的虚拟数字代言人；利用Midjourney+Runway制作超现实主义品牌短片；建立AIGC内容中台赋能经销商。",
                "result": "内容制作成本降低90%，从创意到出片仅需3天，AIGC生成内容互动率高于传统素材2.5倍。"
            },
            "resume_bullets": [
                "打造虚拟数字代言人，内容制作成本降低90%。",
                "建立AIGC中台，创意到出片缩短至3天。",
                "生成超现实短片，互动率高于传统素材2.5倍。"
            ]
        },
        # 18. Investment
        {
            "id": "invest_trad_senior", "seniority": "senior", "is_ai_enhanced": False,
            "industry": "金融", "job_role": "投资总监",
            "skills": ["尽职调查", "估值建模", "行业研究", "投后管理", "退出路径"],
            "star": {
                "situation": "一级市场优质SaaS项目估值倒挂严重，且尽调过程中发现目标公司存在虚增ARR（年度经常性收入）嫌疑。",
                "task": "戳破数据泡沫，挖掘项目真实价值并压低估值。",
                "action": "通过访谈流失客户进行侧面验证；构建Cohort Analysis（留存分析）拆解真实续费率；严查服务器带宽费用与用户量匹配度。",
                "result": "识破其30%的收入注水，成功将Pre-money估值砍掉40%，并在投后帮助其重构销售激励体系。"
            },
            "resume_bullets": [
                "留存分析拆解续费率，识破30%收入注水。",
                "侧面验证流失客户，砍掉40% Pre-money估值。",
                "重构被投企业销售激励，提升投后价值。"
            ]
        },
        {
            "id": "invest_ai_senior", "seniority": "senior", "is_ai_enhanced": True,
            "industry": "金融", "job_role": "量化基金经理",
            "skills": ["另类数据", "因子挖掘", "高频交易", "知识图谱", "回测系统"],
            "star": {
                "situation": "传统多因子选股模型在市场风格快速切换下失效，最大回撤一度超过15%，投资者赎回压力大。",
                "task": "升级量化策略，增强模型在极端行情下的鲁棒性。",
                "action": "挖掘供应链关系、分析师情绪等另类异构数据因子；引入Transformer模型捕捉长周期时序特征；实施对抗生成网络（GAN）生成合成数据训练风控模型。",
                "result": "策略夏普比率（Sharpe Ratio）提升至2.8，在市场下跌20%的情况下实现5%正收益，资金管理规模（AUM）翻倍。"
            },
            "resume_bullets": [
                "引入Transformer捕捉时序特征，夏普比率升至2.8。",
                "挖掘另类异构因子，市场大跌下获5%正收益。",
                "GAN生成合成数据训练风控，AUM实现翻倍。"
            ]
        },
        # 19. Game Producer
        {
            "id": "game_trad_senior", "seniority": "senior", "is_ai_enhanced": False,
            "industry": "游戏", "job_role": "游戏制作人",
            "skills": ["数值平衡", "关卡设计", "版本迭代", "团队管理", "商业化设计"],
            "star": {
                "situation": "MMORPG项目上线后遭遇“通货膨胀”危机，金币贬值导致平民玩家流失严重，DAU腰斩。",
                "task": "重构经济系统，稳定物价并召回流失用户。",
                "action": "建立产销监控仪表盘精准控制货币投放；推出“回收机制”消耗冗余资源；设计赛季制玩法抹平贫富差距。",
                "result": "金币价值回升200%，DAU在两个月内恢复至峰值水平，付费渗透率（ARPPU）不降反升。"
            },
            "resume_bullets": [
                "建立产销监控控制投放，金币价值回升200%。",
                "设计赛季制玩法，DAU两个月恢复峰值。",
                "推出回收机制消耗冗余，ARPPU不降反升。"
            ]
        },
        {
            "id": "game_ai_senior", "seniority": "senior", "is_ai_enhanced": True,
            "industry": "游戏", "job_role": "AI游戏制作人",
            "skills": ["生成式NPC", "AI剧情", "程序化生成", "强化学习测试", "UGC工具"],
            "star": {
                "situation": "开放世界游戏内容填充量巨大，数千个NPC对话呆板枯燥，依靠人工编写剧本成本不可承受。",
                "task": "打造具有自主意识的智能NPC，构建涌现式游戏体验。",
                "action": "接入LLM赋予NPC独特性格与记忆；设计动态任务生成引擎根据玩家行为演化剧情；利用AI生成海量差异化语音。",
                "result": "玩家平均在线时长增加40分钟，NPC交互次数提升10倍，被媒体评为“年度最具沉浸感游戏”。"
            },
            "resume_bullets": [
                "接入LLM赋予NPC记忆，交互次数提升10倍。",
                "动态生成任务演化剧情，在线时长增加40分钟。",
                "AI生成差异化语音，打造沉浸式体验。"
            ]
        },
        # 20. Logistics
        {
            "id": "logistics_trad_senior", "seniority": "senior", "is_ai_enhanced": False,
            "industry": "物流", "job_role": "物流总监",
            "skills": ["线网规划", "运力采购", "仓储布局", "精益物流", "承运商管理"],
            "star": {
                "situation": "双11期间包裹量暴增5倍，某核心分拨中心爆仓，导致干线车辆积压，履约时效延误48小时。",
                "task": "疏通堵点，确保后续产生的包裹不积压。",
                "action": "紧急启用3个临时前置仓进行分流；调度举升机与伸缩机优化装卸动线；实施“以车代库”策略缓解库容压力。",
                "result": "24小时内清除积压包裹，后续日均处理量突破历史峰值，全链路破损率控制在0.03%以内。"
            },
            "resume_bullets": [
                "启用临时前置仓分流，24小时清除爆仓积压。",
                "优化装卸动线，日处理量破峰值且破损率<0.03%。",
                "实施“以车代库”策略，疏通干线车辆积压。"
            ]
        },
        {
            "id": "logistics_ai_senior", "seniority": "senior", "is_ai_enhanced": True,
            "industry": "物流", "job_role": "智慧物流专家",
            "skills": ["运筹优化", "无人仓", "路径规划", "数字孪生", "AGV调度"],
            "star": {
                "situation": "城配业务路径复杂，司机依赖经验导航导致大量绕路与空驶，燃油成本居高不下。",
                "task": "实施智能调度与路径优化，极致降低履约成本。",
                "action": "构建VRP（车辆路径问题）求解器优化多点配送路线；利用机器学习预测路况拥堵；部署混合装载算法提高车厢利用率。",
                "result": "车队满载率提升18.5%，单票配送成本下降22%，日均行驶里程减少15%。"
            },
            "resume_bullets": [
                "构建VRP求解器优化路线，单票成本下降22%。",
                "ML预测拥塞路况，车队满载率提升18.5%。",
                "混合装载算法提升空间利用，日均里程减少15%。"
            ]
        }
    ]
