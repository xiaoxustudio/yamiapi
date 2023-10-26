'use strict'

// ******************************** 玩家队伍管理器 ********************************

const Party = new class {
  /** 玩家角色对象
   *  @type {Actor|null}
   */ player = null

  /** 玩家队伍成员列表
   *  @type {Array<Actor>}
   */ members = []

  /** 玩家队伍共享库存ID
   *  @type {string}
   */ inventoryId = ''

  /** 队伍版本(随着队伍成员的添加和移除发生变化)
   *  @type {number}
   */ version = 0

  /** 初始化队伍管理器 */
  initialize() {
    this.createPlayer()
    this.createMembers()
    this.shareInventory()
  }

  /** 重置队伍角色 */
  reset() {
    this.player = null
    this.members = []
    this.inventoryId = ''
    this.createPlayer()
    this.createMembers()
    this.shareInventory()
  }

  /** 创建玩家角色 */
  createPlayer() {
    const {playerTeam, playerActor} = Data.config.actor
    const actor = ActorManager.create(playerActor)
    if (actor) {
      actor.setTeam(playerTeam)
      this.setPlayer(actor)
    }
  }

  /** 创建玩家队伍成员 */
  createMembers() {
    const {playerTeam, partyMembers} = Data.config.actor
    for (const actorId of partyMembers) {
      const actor = ActorManager.get(actorId) ?? ActorManager.create(actorId)
      if (actor) {
        actor.setTeam(playerTeam)
        this.addMember(actor)
      }
    }
  }

  /**
   * 设置玩家角色
   * @param {GlobalActor} actor 玩家角色
   */
  setPlayer(actor) {
    if (actor instanceof GlobalActor && !actor.destroyed) {
      this.player = actor
    }
  }

  /**
   * 添加玩家队伍成员
   * @param {GlobalActor} actor 队伍成员
   */
  addMember(actor) {
    if (actor instanceof GlobalActor && !actor.destroyed) {
      if (this.members.append(actor)) {
        if (this.inventoryId) {
          const inventoryActor = ActorManager.get(this.inventoryId)
          if (inventoryActor instanceof GlobalActor) {
            actor.useInventory(inventoryActor.inventory)
          }
        }
        this.version++
      }
    }
  }

  /**
   * 移除玩家队伍成员
   * @param {GlobalActor} actor 队伍成员
   */
  removeMember(actor) {
    if (actor instanceof GlobalActor) {
      if (this.members.remove(actor)) {
        if (actor.inventory.actor !== actor &&
          actor.inventory.actor.data.id === this.inventoryId) {
          actor.restoreInventory()
        }
        this.version++
      }
    }
  }

  /** 共享玩家角色库存 */
  shareInventory() {
    if (Data.config.actor.partyInventory === 'shared') {
      if (this.player instanceof GlobalActor) {
        this.inventoryId = this.player.data.id
        for (const actor of this.members) {
          actor.useInventory(this.player.inventory)
        }
      }
    }
  }

  /** 保存队伍角色数据 */
  saveData() {
    return {
      player: this.player?.data.id ?? '',
      members: this.members.map(a => a.data.id),
    }
  }

  /**
   * 加载队伍角色数据
   * @param {Object} party
   */
  loadData(party) {
    const {player, members} = party
    this.player = ActorManager.get(player) ?? null
    this.members = []
    for (const member of members) {
      const actor = ActorManager.get(member)
      if (actor) this.addMember(actor)
    }
  }
}

// ******************************** 势力队伍管理器 ********************************

const Team = new class {
  /** 队伍列表
   *  @type {Array<string>}
   */ list

  /** 队伍的键(ID)列表
   *  @type {Array<string>}
   */ keys

  /** 队伍的键(ID)列表
   *  @type {Array<string>}
   */ map

  /** 默认队伍ID
   *  @type {string}
   */ defaultId

  /** 队伍关系数组(0:敌对, 1:友好)
   *  @type {Uint8Array}
   */ relationMap = new Uint8Array(65536)

  /** 队伍碰撞开关表(0:关闭, 1:开启)
   *  @type {Uint8Array}
   */ collisionMap = new Uint8Array(65536)

  /** 初始化 */
  initialize() {
    // 给队伍设置索引
    const map = {}
    const teams = Data.teams.list
    const keys = teams.map(team => team.id)
    this.list = teams
    this.keys = keys
    this.map = map
    const data = this.unpackTeamData(keys, Data.teams)
    const length = teams.length
    for (let i = 0; i < length; i++) {
      const team = teams[i]
      const key = keys[i]
      team.index = i
      team.relations = data.relationsMap[key]
      team.collisions = data.collisionsMap[key]
      map[team.id] = team
      for (let j = 0; j < length; j++) {
        this.relationMap[i | j << 8] = team.relations[keys[j]]
        this.collisionMap[i | j << 8] = team.collisions[keys[j]]
      }
    }
    this.defaultId = keys[0]
  }

  /**
   * 解包角色队伍数据
   * @param {string[]} keys 队伍的ID列表
   * @param {string} code 队伍的关系代码
   * @returns {Object}
   */
  unpackTeamData(keys, data) {
    const relationsMap = {}
    const collisionsMap = {}
    const length = keys.length
    // 解码已压缩的队伍关系数据
    const sRelations = Codec.decodeTeamData(data.relations, length)
    const sCollisions = Codec.decodeTeamData(data.collisions, length)
    const a = length * 2
    // 构建完整的队伍关系数据结构
    for (let i = 0; i < length; i++) {
      const dRelations = {}
      const dCollisions = {}
      for (let j = 0; j < i; j++) {
        const ri = (a - j + 1) / 2 * j - j + i
        dRelations[keys[j]] = sRelations[ri]
        dCollisions[keys[j]] = sCollisions[ri]
      }
      const b = (a - i + 1) / 2 * i - i
      for (let j = i; j < length; j++) {
        const ri = b + j
        dRelations[keys[j]] = sRelations[ri]
        dCollisions[keys[j]] = sCollisions[ri]
      }
      relationsMap[keys[i]] = dRelations
      collisionsMap[keys[i]] = dCollisions
    }
    return {relationsMap, collisionsMap}
  }

  /**
   * 通过ID获取队伍
   * @param {string} teamId 队伍ID
   * @returns {Object} 队伍
   */
  get(teamId) {
    return this.map[teamId]
  }

  /**
   * 通过队伍索引获取队伍关系
   * @param {number} teamIndex1 队伍索引1
   * @param {number} teamIndex2 队伍索引2
   * @returns {number} 队伍关系(0:敌对, 1:友好)
   */
  getRelationByIndexes(teamIndex1, teamIndex2) {
    return this.relationMap[teamIndex1 | teamIndex2 << 8]
  }

  /**
   * 判断敌对关系
   * @param {string} teamId1 队伍ID1
   * @param {string} teamId2 队伍ID2
   * @returns {boolean} 是否为敌对关系
   */
  isEnemy(teamId1, teamId2) {
    return this.map[teamId1]?.relations[teamId2] === 0
  }

  /**
   * 判断友好关系
   * @param {string} teamId1 队伍ID1
   * @param {string} teamId2 队伍ID2
   * @returns {boolean} 是否为友好关系
   */
  isFriendly(teamId1, teamId2) {
    return this.map[teamId1]?.relations[teamId2] === 1
  }

  /**
   * 改变角色队伍的关系
   * @param {string} teamId1 队伍ID1
   * @param {string} teamId2 队伍ID2
   * @param {number} relation 队伍1和队伍2的关系(0:敌对, 1:友好)
   */
  changeRelation(teamId1, teamId2, relation) {
    const team1 = this.get(teamId1)
    const team2 = this.get(teamId2)
    if (team1 && team2) {
      team1.relations[teamId2] = relation
      team2.relations[teamId1] = relation
      this.relationMap[team1.index | team2.index << 8] = relation
      this.relationMap[team2.index | team1.index << 8] = relation
    }
  }

  /** 保存队伍关系数据 */
  saveData() {
    const keys = this.keys
    const teams = this.list
    const length = teams.length
    const dRelations = GL.arrays[0].uint8
    const dCollisions = GL.arrays[1].uint8
    let ri = 0
    // 压缩队伍关系数据
    for (let i = 0; i < length; i++) {
      const team = teams[i]
      const sRelations = team.relations
      const sCollisions = team.collisions
      for (let j = i; j < length; j++, ri++) {
        dRelations[ri] = sRelations[keys[j]]
        dCollisions[ri] = sCollisions[keys[j]]
      }
    }
    // 编码已压缩的队伍关系数据
    return {
      keys: keys,
      relations: Codec.encodeTeamData(new Uint8Array(dRelations.buffer, 0, ri)),
      collisions: Codec.encodeTeamData(new Uint8Array(dCollisions.buffer, 0, ri)),
    }
  }

  /**
   * 加载队伍关系数据
   * @param {Object} team
   */
  loadData(team) {
    const sKeys = team.keys
    const data = this.unpackTeamData(sKeys, team)
    const dKeys = this.keys
    const teams = this.list
    const length = teams.length
    // 将加载的队伍关系数据合并到现有的数据中
    // 丢弃项目编辑所造成的无效数据
    for (let i = 0; i < length; i++) {
      const key = dKeys[i]
      const sRelations = data.relationsMap[key]
      const sCollisions = data.collisionsMap[key]
      if (!sRelations || !sCollisions) continue
      const team = teams[i]
      const dRelations = team.relations
      const dCollisions = team.collisions
      for (let j = 0; j < length; j++) {
        const key = dKeys[j]
        const relation = sRelations[key]
        if (relation !== undefined) {
          dRelations[key] = relation
          this.relationMap[i | j << 8] = relation
        }
        const collision = sCollisions[key]
        if (collision !== undefined) {
          dCollisions[key] = collision
          this.collisionMap[i | j << 8] = collision
        }
      }
    }
  }
}

// ******************************** 全局角色管理器 ********************************

const ActorManager = new class {
  /** 全局角色列表
   *  @type {Array<Actor>}
   */ list = []

  /** 全局角色ID映射表(ID->实例)
   *  @type {Object}
   */ idMap = {}

  /** 重置全局角色 */
  reset() {
    this.clearGlobalActors()
  }

  /** 清除所有全局角色 */
  clearGlobalActors() {
    this.idMap = {}
    // 遍历所有全局角色
    for (const actor of this.list) {
      for (const context of Scene.contexts) {
        // 从所有场景角色列表中移除该角色
        if (context?.actors.includes(actor)) {
          context.actors.remove(actor)
        }
      }
      actor.destroy()
    }
    this.list = []
  }

  /**
   * 创建全局角色
   * @param {string} actorId 角色文件ID
   * @param {Object} [savedData] 角色存档数据
   * @returns {GlobalActor|null}
   */
  create(actorId, savedData) {
    const data = Data.actors[actorId]
    if (!this.idMap[actorId] && data) {
      // 如果角色ID未被占用，则创建角色
      const actor = new GlobalActor(data, savedData)
      this.idMap[actorId] = actor
      this.list.push(actor)
      return actor
    }
    return null
  }

  /**
   * 删除全局角色
   * @param {string} actorId 角色文件ID
   */
  delete(actorId) {
    const actor = this.idMap[actorId]
    if (actor) {
      for (const context of Scene.contexts) {
        // 从所有场景角色列表中移除该角色
        if (context?.actors.includes(actor)) {
          context.actors.remove(actor)
        }
      }
      delete this.idMap[actorId]
      actor.destroy()
      this.list.remove(actor)
      Party.removeMember(actor)
      if (Party.player === actor) {
        Party.player = null
      }
    }
  }

  /**
   * 获取全局角色
   * @param {string} actorId 角色文件ID
   * @returns {GlobalActor|undefined}
   */
  get(actorId) {
    return this.idMap[actorId]
  }

  /** 保存全局角色列表数据 */
  saveData() {
    const actors = this.list
    const length = actors.length
    const data = new Array(length)
    for (let i = 0; i < length; i++) {
      data[i] = actors[i].saveData()
    }
    return data
  }

  /**
   * 加载全局角色列表数据
   * @param {Object} actors
   */
  loadData(actors) {
    this.clearGlobalActors()
    // 恢复全局角色列表
    for (const savedData of actors) {
      this.create(
        savedData.fileId,
        savedData,
      )
    }
  }
}

// ******************************** 角色类 ********************************

class Actor {
  /** 角色对象可见性
   *  @type {boolean}
   */ visible

  /** 角色对象实体ID
   *  @type {string}
   */ entityId

  /** 角色预设数据ID
   *  @type {string}
   */ presetId

  /** 角色独立变量ID
   *  @type {string}
   */ selfVarId

  /** 角色对象名称
   *  @type {string}
   */ name

  /** 角色头像ID
   *  @type {string}
   */ portrait

  /** 角色头像矩形裁剪区域
   *  @type {Array<number>}
   */ clip

  /** 角色文件数据
   *  @type {Object}
   */ data

  /** 角色的场景分区ID
   *  @type {number}
   */ cellId

  /** 角色的场景网格ID
   *  @type {number}
   */ gridId

  /** 角色队伍ID
   *  @type {string}
   */ teamId

  /** 角色队伍索引
   *  @type {number}
   */ teamIndex

  /** 角色的激活状态
   *  @type {boolean}
   */ active

  /** 角色是否已销毁
   *  @type {boolean}
   */ destroyed

  /** 角色的通行区域
   *  @type {number}
   */ passage

  /** 角色的渲染优先级
   *  @type {number}
   */ priority

  /** 角色的场景位置X
   *  @type {number}
   */ x

  /** 角色的场景位置Y
   *  @type {number}
   */ y

  /** 角色的整数位置X
   *  @type {number}
   */ intX

  /** 角色的整数位置Y
   *  @type {number}
   */ intY

  /** 角色的缩放系数
   *  @type {number}
   */ scale

  /** 角色的角度
   *  @type {number}
   */ angle

  /** 是否固定角度
   *  @type {boolean}
   */ angleFixed

  /** 受击时间戳
   *  @type {number}
   */ hitTimestamp

  /** 角色碰撞器组件
   *  @type {ActorCollider}
   */ collider

  /** 角色导航器组件
   *  @type {ActorNavigator}
   */ navigator

  /** 角色动画播放器组件
   *  @type {Animation}
   */ animation

  /** 角色动画精灵图表
   *  @type {Object}
   */ sprites

  /** 角色更新器列表
   *  @type {ModuleList}
   */ updaters

  /** 角色属性映射表
   *  @type {Object}
   */ attributes

  /** 角色动画控制器组件
   *  @type {AnimationController}
   */ animationController

  /** 角色动画管理器
   *  @type {Array<Animation>}
   */ animationManager

  /** 角色技能管理器
   *  @type {SkillManager}
   */ skillManager

  /** 角色状态管理器
   *  @type {StateManager}
   */ stateManager

  /** 角色装备管理器
   *  @type {EquipmentManager}
   */ equipmentManager

  /** 角色公共冷却管理器
   *  @type {CooldownManager}
   */ cooldownManager

  /** 角色快捷栏管理器
   *  @type {ShortcutManager}
   */ shortcutManager

  /** 角色目标对象管理器
   *  @type {TargetManager}
   */ targetManager

  /** 角色库存管理器
   *  @type {Inventory}
   */ inventory

  /** 角色事件类型映射表
   *  @type {Object}
   */ events

  /** 角色脚本管理器
   *  @type {Script}
   */ script

  /** 角色的父级对象
   *  @type {SceneActorList|null}
   */ parent

  /** 已开始状态
   *  @type {boolean}
   */ started

  /**
   * 场景角色对象
   * @param {ActorFile} data 角色文件数据
   * @param {Object} [savedData] 角色存档数据
   * @param {string} [presetId] 角色预设数据ID
   */
  constructor(data, savedData, presetId = '') {
    this.visible = true
    this.entityId = ''
    this.presetId = presetId
    this.selfVarId = ''
    this.name = ''
    this.portrait = data.portrait
    this.clip = [...data.clip]
    this.data = data
    this.cellId = -1
    this.gridId = -1
    this.teamId = Team.defaultId
    this.teamIndex = 0
    this.active = true
    this.destroyed = false
    this.priority = data.priority
    this.x = 0
    this.y = 0
    this.scale = data.scale
    this.angle = 0
    this.angleFixed = false
    this.hitTimestamp = -100000000
    this.parent = null
    this.started = false

    // 角色组件
    this.collider = new ActorCollider(this)
    this.navigator = new ActorNavigator(this)
    this.animation = null
    this.sprites = null
    this.updaters = new ModuleList()
    this.attributes = null
    this.animationController = new AnimationController(this)
    this.animationManager = new AnimationManager(this)
    this.skillManager = new SkillManager(this)
    this.stateManager = new StateManager(this)
    this.equipmentManager = new EquipmentManager(this)
    this.cooldownManager = new CooldownManager(this)
    this.shortcutManager = new ShortcutManager(this)
    this.targetManager = new TargetManager(this)
    this.inventory = new Inventory(this)
    this.events = data.events
    this.script = Script.create(this, data.scripts)
    Actor.latest = this

    if (savedData) {
      // 加载存档数据
      this.visible = savedData.visible
      this.entityId = savedData.entityId
      this.presetId = savedData.presetId
      this.selfVarId = savedData.selfVarId
      this.name = savedData.name
      this.active = savedData.active
      this.passage = savedData.passage
      this.priority = savedData.priority
      this.portrait = savedData.portrait
      this.clip = savedData.clip
      this.scale = savedData.scale
      this.angle = savedData.angle
      this.sprites = savedData.sprites
      this.setTeam(savedData.teamId)
      this.setPosition(savedData.x, savedData.y)
      this.collider.weight = savedData.weight
      this.navigator.movementSpeed = savedData.movementSpeed
      this.navigator.movementFactor = savedData.movementFactor
      this.attributes = savedData.attributes
      this.animationController.loadData(savedData.motions)
      this.animationManager.loadData(savedData.animations)
      this.animation = this.animationManager.get('actor') ?? null
      this.animation?.setSpriteImages(savedData.sprites)
      this.animationController.bindAnimation(this.animation)
      this.skillManager.loadData(savedData.skills)
      this.stateManager.loadData(savedData.states)
      this.equipmentManager.loadData(savedData.equipments)
      this.cooldownManager.loadData(savedData.cooldowns)
      this.shortcutManager.loadData(savedData.shortcuts)
      this.inventory.loadData(savedData.inventory)
      EntityManager.add(this)
    } else {
      // 初始化
      EntityManager.add(this)
      this.setPassage(data.passage)
      this.setAnimation(data.animationId)
      this.loadSprites()
      this.loadAttributes()
      this.loadSkills()
      this.loadEquipments()
      this.loadInventory()
      this.emit('create')
    }

    // 定义临时属性
    Actor.defineTempAttributes(this.attributes)
  }

  /** 加载初始动画精灵哈希表 */
  loadSprites() {
    const map = {}
    const sprites = this.data.sprites
    const length = sprites.length
    // 使用精灵数组生成哈希表
    for (let i = 0; i < length; i++) {
      const sprite = sprites[i]
      map[sprite.id] = sprite.image
    }
    this.sprites = map
    // 角色精灵图像优先于默认动画精灵图像
    this.animation?.setSpriteImages(map)
  }

  /** 加载初始角色属性 */
  loadAttributes() {
    Attribute.loadEntries(
      this.attributes = {},
      this.data.attributes,
    )
  }

  /** 加载初始角色技能 */
  loadSkills() {
    const {skillManager} = this
    const dataMap = Data.skills
    const skills = this.data.skills
    const length = skills.length
    // 创建初始技能并设置快捷键
    for (let i = 0; i < length; i++) {
      const skill = skills[i]
      const data = dataMap[skill.id]
      const key = Enum.get(skill.key)
      if (data !== undefined) {
        const skill = new Skill(data)
        skillManager.add(skill)
        if (key) {
          this.shortcutManager.set(key.value, skill)
        }
      }
    }
  }

  /** 加载初始角色装备 */
  loadEquipments() {
    const {equipmentManager} = this
    const dataMap = Data.equipments
    const equipments = this.data.equipments
    const length = equipments.length
    // 创建初始装备并设置快捷键
    for (let i = 0; i < length; i++) {
      const equipment = equipments[i]
      const data = dataMap[equipment.id]
      const slot = Enum.get(equipment.slot)
      if (data !== undefined && slot !== undefined) {
        equipmentManager.set(slot.value, new Equipment(data))
      }
    }
  }

  /** 加载初始角色库存 */
  loadInventory() {
    const inventory = this.inventory
    const list = this.data.inventory
    const length = list.length
    // 创建初始物品和装备，避免触发获得事件
    for (let i = 0; i < length; i++) {
      const goods = list[i]
      switch (goods.type) {
        case 'item': {
          const data = Data.items[goods.id]
          if (data) {
            const item = new Item(data)
            inventory.insert(item)
            item.increase(goods.quantity)
          }
          continue
        }
        case 'equipment': {
          const data = Data.equipments[goods.id]
          if (data) {
            inventory.insert(new Equipment(data))
          }
          continue
        }
        case 'money':
          inventory.money += goods.money
          continue
      }
    }
  }

  /**
   * 角色朝指定角度位移一段距离
   * @param {number} angle 位移角度(弧度)
   * @param {number} distance 位移距离(单位:图块)
   * @param {string} [easingId] 过渡曲线ID
   * @param {number} [duration] 持续时间(毫秒)
   * @param {string} [key] 位移更新器的键(指定以避免冲突)
   */
  translate(angle, distance, easingId, duration, key = 'translate') {
    const distX = distance * Math.cos(angle)
    const distY = distance * Math.sin(angle)
    if (duration > 0) {
      // 创建过渡更新器，使用set方法:
      // 如果已有同名更新器，则替换
      let elapsed = 0
      let lastTime = 0
      const easing = Easing.get(easingId)
      this.updaters.set(key, {
        protected: true,
        update: deltaTime => {
          // 更新中不断设置角色位置
          elapsed += deltaTime
          const time = easing.map(elapsed / duration)
          const increase = time - lastTime
          const x = distX * increase
          const y = distY * increase
          this.move(x, y)
          lastTime = time
          // 过渡结束，延迟删除更新器
          if (elapsed >= duration) {
            this.updaters.deleteDelay(key)
          }
        }
      })
    } else {
      // 立即执行
      this.updaters.deleteDelay(key)
      const x = this.x + distX
      const y = this.y + distY
      this.setPosition(x, y)
    }
  }

  /**
   * 设置角色的缩放系数
   * @param {number} scale 角色缩放系数
   * @param {string} easingId 过渡曲线ID
   * @param {number} [duration] 持续时间(毫秒)
   */
  setScale(scale, easingId, duration) {
    if (duration > 0) {
      // 创建过渡更新器，使用set方法:
      // 如果已有同名更新器，则替换
      let elapsed = 0
      const start = this.scale
      const easing = Easing.get(easingId)
      this.updaters.set('scale', {
        protected: true,
        update: deltaTime => {
          // 更新中不断设置角色角度
          elapsed += deltaTime
          const time = easing.map(elapsed / duration)
          this.scale = start * (1 - time) + scale * time
          this.animationManager.setGlobalScale(this.scale)
          // 过渡结束，延迟删除更新器
          if (elapsed >= duration) {
            this.updaters.deleteDelay('scale')
          }
        }
      })
    } else {
      // 立即执行
      this.updaters.deleteDelay('scale')
      this.scale = scale
      this.animationManager.setGlobalScale(this.scale)
    }
  }

  /**
   * 设置角色的角度
   * @param {number} angle 角色角度(弧度)
   * @param {string} [easingId] 过度曲线ID
   * @param {number} [duration] 持续时间(毫秒)
   */
  setAngle(angle, easingId, duration) {
    if (duration > 0) {
      this.rotate(angle - this.angle, easingId, duration)
    } else {
      // 立即执行
      this.updaters.deleteDelay('rotate')
      this.updateAngle(angle)
    }
  }

  /**
   * 角色旋转指定的角度
   * @param {number} angle 旋转角度(弧度)
   * @param {string} [easingId] 过渡曲线ID
   * @param {number} [duration] 持续时间(毫秒)
   * @param {string} [key] 旋转更新器的键(指定以避免冲突)
   */
  rotate(angle, easingId, duration, key = 'rotate') {
    if (duration > 0) {
      // 创建过渡更新器，使用set方法:
      // 如果已有同名更新器，则替换
      let elapsed = 0
      let lastTime = 0
      const easing = Easing.get(easingId)
      this.updaters.set(key, {
        protected: true,
        update: deltaTime => {
          // 更新中不断设置角色角度
          elapsed += deltaTime
          const time = easing.map(elapsed / duration)
          this.updateAngle(this.angle + angle * (time - lastTime))
          lastTime = time
          // 过渡结束，延迟删除更新器
          if (elapsed >= duration) {
            this.updaters.deleteDelay(key)
          }
        }
      })
    } else {
      // 立即执行
      this.updaters.deleteDelay(key)
      this.updateAngle(this.angle + angle)
    }
  }

  /**
   * 设置角色动画
   * @param {string} animationId 动画文件ID
   */
  setAnimation(animationId) {
    const data = Data.animations[animationId]
    if (data) {
      // 如果动画ID有效，创建新的动画播放器
      const animation = new Animation(data)
      animation.rotatable = this.data.rotatable
      animation.syncAngle = true
      this.animationManager.set('actor', animation)
      this.animation = animation
    } else if (this.animation) {
      // 否则销毁上一个动画播放器
      this.animationManager.delete('actor')
      this.animation = null
    }
    // 绑定到动画控制器
    this.animationController.bindAnimation(this.animation)
  }

  /**
   * 设置角色的精灵图
   * @param {string} spriteId 精灵图ID
   * @param {string} imageId 图像文件ID
   */
  setSprite(spriteId, imageId) {
    // 修改角色精灵表中的键值
    this.sprites[spriteId] = imageId
    // 如果角色动画已经加载了同名纹理，则删除
    this.animation?.deleteTexture(spriteId)
  }

  /**
   * 设置角色的队伍
   * @param {string} teamId 队伍ID
   */
  setTeam(teamId) {
    const team = Team.get(teamId)
    if (team !== undefined) {
      this.teamId = teamId
      this.teamIndex = team.index
    }
  }

  /**
   * 设置通行区域
   * @param {string} passage 通行区域
   */
  setPassage(passage) {
    this.passage = Actor.passageMap[passage]
  }

  /**
   * 移动角色
   * @param {number} x 位移X
   * @param {number} y 位移Y
   */
  move(x, y) {
    this.x += x
    this.y += y
    // 设置碰撞器为已经移动状态
    this.collider.moved = true
  }

  /**
   * 设置角色在场景中的位置
   * @param {number} x 场景网格X
   * @param {number} y 场景网格Y
   */
  setPosition(x, y) {
    this.x = x
    this.y = y
    this.updateGridPosition()
    // 设置碰撞器为已经移动状态
    this.collider.moved = true
  }

  /**
   * 更新角色在场景中的网格位置
   */
  updateGridPosition() {
    this.intX = Math.floor(this.x)
    this.intY = Math.floor(this.y)
  }

  /**
   * 更新受击时间戳
   */
  updateHitTimestamp() {
    this.hitTimestamp = Time.elapsed
  }

  /**
   * 设置角色的激活状态
   * @param {boolean} active 如果禁用，角色将不再更新事件和脚本
   */
  setActive(active) {
    if (this.active !== active) {
      this.active = active
      // 如果是未激活状态，重置目标列表
      if (!active) {
        this.targetManager.reset()
      }
    }
  }

  /**
   * 判断角色是否处于激活状态(并且已出场)
   * @returns {boolean}
   */
  isActive() {
    return this.active && this.parent !== null
  }

  /**
   * 更新角色的角度，并计算动画动作方向
   * @param {number} angle 弧度
   */
  updateAngle(angle) {
    if (this.angleFixed) return
    angle = Math.modRadians(angle)
    // 当新的角度与当前角度不同时，计算动画方向
    // 允许存在一点角度误差，避免频繁计算动画方向
    if (Math.abs(this.angle - angle) >= 0.0001) {
      this.angle = angle
      this.animationManager.setAngle(angle)
    }
  }

  /**
   * 更新角色的模块
   * @param {number} deltaTime 增量时间(毫秒)
   */
  update(deltaTime) {
    // 更新导航器
    this.navigator.update(deltaTime)

    // 更新动画组件
    this.animationManager.update(deltaTime)

    // 更新模块列表
    if (this.active) {
      this.updaters.update(deltaTime)
    } else {
      // 如果角色未激活，仅执行受保护的更新器
      for (const updater of this.updaters) {
        if (updater.protected) {
          updater.update(deltaTime)
        }
      }
    }
  }

  /**
   * 使用指定全局角色的库存
   * @param {Inventory} inventory 全局角色的库存
   */
  useInventory(inventory) {
    if (this.inventory !== inventory) {
      if (!this.savedInventory) {
        this.savedInventory = this.inventory
      }
      this.inventory = inventory
    }
  }

  /**
   * 恢复角色的库存引用
   */
  restoreInventory() {
    if (this.savedInventory) {
      this.inventory = this.savedInventory
      delete this.savedInventory
    }
  }

  /**
   * 调用角色事件
   * @param {string} type 角色事件类型
   * @returns {EventHandler|undefined}
   */
  callEvent(type) {
    const commands = this.events[type]
    if (commands) {
      const event = new EventHandler(commands)
      event.triggerActor = this
      event.selfVarId = this.selfVarId
      return EventHandler.call(event, this.updaters)
    }
  }

  /**
   * 调用角色事件和脚本
   * @param {string} type 角色事件类型
   */
  emit(type) {
    this.callEvent(type)
    this.script.emit(type, this)
  }

  // 自动执行
  autorun() {
    if (this.started === false) {
      this.started = true
      this.emit('autorun')
    }
  }

  /** 销毁角色 */
  destroy() {
    if (!this.destroyed) {
      EntityManager.remove(this)
      this.parent?.remove(this)
      this.destroyed = true
      this.active = false
      this.targetManager.reset()
      this.animationManager.destroy()
      this.emit('destroy')
    }
  }

  /** 保存角色数据 */
  saveData() {
    return {
      visible: this.visible,
      entityId: this.entityId,
      presetId: this.presetId,
      selfVarId: this.selfVarId,
      fileId: this.data.id,
      teamId: this.teamId,
      active: this.active,
      passage: this.passage,
      priority: this.priority,
      name: this.name,
      x: this.x,
      y: this.y,
      scale: this.scale,
      angle: this.angle,
      portrait: this.portrait,
      clip: this.clip,
      sprites: this.sprites,
      weight: this.collider.weight,
      motions: this.animationController.saveData(),
      movementSpeed: this.navigator.movementSpeed,
      movementFactor: this.navigator.movementFactor,
      attributes: this.attributes,
      animations: this.animationManager.saveData(),
      skills: this.skillManager.saveData(),
      states: this.stateManager.saveData(),
      equipments: this.equipmentManager.saveData(),
      cooldowns: this.cooldownManager.saveData(),
      shortcuts: this.shortcutManager.saveData(),
      inventory: this.inventory.saveData(this),
    }
  }

  /** 最新创建的角色
   *  @type {Actor|undefined}
   */ static latest

  /** 定义临时属性映射表方法
   *  @type {Function}
   */ static defineTempAttributes

  /** 通行区域映射表 */
  static passageMap = {
    land: 0,
    water: 1,
    unrestricted: -1,
  }

  /** 初始化角色相关的数据 */
  static initialize() {
    // 创建角色临时属性的描述器
    let hasAttributes = false
    const properties = {}
    for (const entry of Data.config.actor.tempAttributes) {
      const attr = Attribute.get(entry.key)
      if (!attr) continue
      let value = entry.value
      if (attr.type === 'enum') {
        const enumstr = Enum.get(value)
        if (!enumstr) continue
        value = enumstr.value
      }
      hasAttributes = true
      properties[attr.key] = {
        configurable: true,
        writable: true,
        value: value,
      }
    }
    // 创建定义角色临时属性方法
    if (hasAttributes) {
      this.defineTempAttributes = attributes => {
        Object.defineProperties(attributes, properties)
      }
    } else {
      this.defineTempAttributes = Function.empty
    }
  }

  // 角色检查器集合
  static inspectors = new class {
    // 检查器 - 判断敌对角色
    'enemy' = (a, b) => {
      return Team.relationMap[a.teamIndex | b.teamIndex << 8] === 0 && a !== b
    }

    // 检查器 - 判断友好角色
    'friend' = (a, b) => {
      return Team.relationMap[a.teamIndex | b.teamIndex << 8] === 1
    }

    // 检查器 - 判断小队角色
    'team' = (a, b) => {
      return a.teamId === b.teamId
    }

    // 检查器 - 判断小队角色除自己以外
    'team-except-self' = (a, b) => {
      return a !== b && a.teamId === b.teamId
    }

    // 检查器 - 判断任意角色除自己以外
    'any-except-self' = (a, b) => {
      return a !== b
    }

    // 检查器 - 判断任意角色
    'any' = (a, b) => {
      return true
    }
  }
}

// ******************************** 全局角色类 ********************************

class GlobalActor extends Actor {
  /**
   * 转移到场景中的指定位置
   * @param {number} x 场景坐标X
   * @param {number} y 场景坐标Y
   */
  transferToScene(x, y) {
    if (Scene.binding && !this.destroyed) {
      this.parent?.remove(this)
      this.setPosition(x, y)
      this.targetManager.reset()
      Scene.actors.append(this)
    }
  }

  /** 销毁全局角色 */
  destroy() {
    if (ActorManager.get(this.data.id) === this) {
      // 如果角色还存在于管理器中，释放资源
      this.parent?.remove(this)
      this.navigator.stopMoving()
      this.targetManager.reset()
      this.animationManager.release()
    } else {
      super.destroy()
    }
  }
}

// ******************************** 角色动画管理器类 ********************************

class AnimationManager {
  constructor(actor) {
    this.actor = actor
    this.scale = actor.scale
    this.existParticles = false
    this.list = []
    this.keyMap = {}
  }

  /**
   * 获取动画播放器
   * @param {string} key 动画键
   * @returns {Animation|undefined}
   */
  get(key) {
    return this.keyMap[key]
  }

  /**
   * 设置动画播放器
   * @param {string} key 动画键
   * @param {Animation} animation 动画播放器
   */
  set(key, animation) {
    if (key && this.keyMap[key] !== animation) {
      animation.key = key
      animation.parent = this
      animation.setPosition(this.actor)
      // 设置原始缩放系数
      if (animation.rawScale === undefined) {
        animation.rawScale = animation.scale
        animation.scale *= this.scale
      }
      // 设置原始偏移Y
      if (animation.rawOffsetY === undefined) {
        animation.rawOffsetY = animation.offsetY
        animation.offsetY *= this.scale
      }
      // 如果存在旧的动画替换它(销毁)
      const oldAnim = this.keyMap[key]
      if (oldAnim instanceof Animation) {
        // 继承一部分数据
        animation.rawScale = oldAnim.rawScale
        animation.scale = oldAnim.scale
        animation.speed = oldAnim.speed
        animation.opacity = oldAnim.opacity
        animation.setMotion(oldAnim.motionName)
        animation.setAngle(oldAnim.angle)
        oldAnim.destroy()
        this.list.replace(oldAnim, animation)
        this.keyMap[key] = animation
      } else {
        this.list.push(animation)
        this.keyMap[key] = animation
      }
      this.sort()
    }
  }

  /**
   * 删除动画播放器
   * @param {string} key 动画键
   */
  delete(key) {
    const animation = this.keyMap[key]
    if (animation) {
      animation.destroy()
      this.list.remove(animation)
      delete this.keyMap[key]
    }
  }

  /**
   * 播放动作(结束时恢复动作)
   * @param {string} key 动画键
   * @param {string} motionName 动作名称
   * @returns {Animation|undefined}
   */
  playMotion(key, motionName) {
    const animation = this.get(key)
    if (animation?.setMotion(motionName)) {
      animation.playing = true
      // 重新播放动画
      const callback = () => {
        if (animation.playing) {
          // 播放结束后设置回默认动作
          animation.playing = false
          if (animation.setMotion(animation.defaultMotion)) {
            animation.restart()
          }
        } else {
          animation.onFinish(callback)
        }
      }
      animation.restart()
      animation.onFinish(callback)
      // 返回动画对象
      return animation
    }
    return undefined
  }

  /**
   * 停止播放动画动作
   * @param {string} key 动画键
   */
  stopMotion(key) {
    this.get(key)?.finish()
  }

  /**
   * 设置全局缩放系数
   * @param {string} key 动画键
   * @param {number} scale 缩放系数
   */
  setGlobalScale(scale) {
    this.scale = scale
    for (const animation of this.list) {
      animation.scale = animation.rawScale * scale
      animation.offsetY = animation.rawOffsetY * scale
    }
  }

  /**
   * 设置动画缩放系数
   * @param {string} key 动画键
   * @param {number} scale 缩放系数
   */
  setScale(key, scale) {
    const animation = this.keyMap[key]
    if (animation) {
      animation.rawScale = scale
      animation.scale = scale * this.scale
    }
  }

  /**
   * 设置动画角度
   * @param {number} angle 角度(弧度)
   */
  setAngle(angle) {
    for (const animation of this.list) {
      if (animation.syncAngle) {
        if (animation.playing) {
          animation.playing = false
          animation.setAngle(angle)
          animation.playing = true
        } else {
          animation.setAngle(angle)
        }
      }
    }
  }

  /**
   * 设置动画优先级
   * @param {string} key 动画键
   * @param {number} priority 排序优先级
   */
  setPriority(key, priority) {
    const animation = this.keyMap[key]
    if (animation) {
      animation.priority = priority
      this.sort()
    }
  }

  /**
   * 设置动画垂直偏移距离
   * @param {string} key 动画键
   * @param {number} offsetY 垂直偏移
   */
  setOffsetY(key, offsetY) {
    const animation = this.keyMap[key]
    if (animation) {
      animation.rawOffsetY = offsetY
      animation.offsetY = offsetY * this.scale
    }
  }

  /**
   * 设置角色的精灵图
   * @param {string} key 动画键
   * @param {string} spriteId 精灵图ID
   * @param {string} imageId 图像文件ID
   */
  setSprite(key, spriteId, imageId) {
    const animation = this.keyMap[key]
    if (animation && spriteId) {
      // 创建优先精灵图像映射表
      if (!animation.priorityImages) {
        animation.priorityImages = {}
        animation.setSpriteImages(animation.priorityImages)
      }
      // 修改角色精灵表中的键值
      animation.priorityImages[spriteId] = imageId
      // 删除精灵图像 - 暂时保留
      // if (animation.priorityImages) {
      //   // 删除优先精灵图像
      //   delete animation.priorityImages[spriteId]
      //   // 如果优先精灵图像映射表为空，删除它并恢复默认图像映射表
      //   if (Object.keys(animation.priorityImages).length === 0) {
      //     animation.restoreSpriteImages()
      //     delete animation.priorityImages
      //   }
      // }
      // 如果角色动画已经加载了同名纹理，则删除
      animation?.deleteTexture(spriteId)
    }
  }

  /** 排序动画组件 */
  sort() {
    this.list.sort(AnimationManager.sorter)
  }

  /**
   * 更新角色动画播放进度
   * @param {number} deltaTime 增量时间(毫秒)
   */
  update(deltaTime) {
    this.existParticles = false
    for (const animation of this.list) {
      animation.update(deltaTime)
      if (animation.existParticles) {
        this.existParticles = true
      }
    }
  }

  /**
   * 绘制角色动画
   */
  draw() {
    for (const animation of this.list) {
      animation.draw()
    }
  }

  /**
   * 激活管理器中的动画
   * @param {number} x 动画的场景X
   * @param {number} y 动画的场景Y
   */
  activate(drawX, drawY, lightX, lightY) {
    for (const animation of this.list) {
      animation.activate(drawX, drawY, lightX, lightY)
    }
  }

  /** 释放所有动画组件显存 */
  release() {
    for (const animation of this.list) {
      animation.release()
    }
  }

  /** 销毁所有动画组件 */
  destroy() {
    for (const animation of this.list) {
      // 完成动画结束回调并销毁动画
      animation.finish()
      animation.destroy()
    }
  }

  /** 保存动画组件列表数据 */
  saveData() {
    const length = this.list.length
    const animations = new Array(length)
    for (let i = 0; i < length; i++) {
      const animation = this.list[i]
      // 编码为json时忽略undefined
      animations[i] = {
        id: animation.data.id,
        key: animation.key,
        rotatable: animation.rotatable,
        syncAngle: animation.syncAngle,
        angle: animation.angle,
        scale: animation.rawScale,
        speed: animation.speed,
        opacity: animation.opacity,
        priority: animation.priority,
        offsetY: animation.rawOffsetY,
        motion: animation.defaultMotion ?? undefined,
        images: animation.priorityImages ?? undefined,
      }
    }
    return animations
  }

  /**
   * 加载动画组件列表数据
   * @param {Object[]} animations
   */
  loadData(animations) {
    this.scale = this.actor.scale
    for (const savedData of animations) {
      const data = Data.animations[savedData.id]
      if (data) {
        const animation = new Animation(data)
        animation.key = savedData.key
        animation.playing = false
        animation.rotatable = savedData.rotatable
        animation.syncAngle = savedData.syncAngle
        animation.rawScale = savedData.scale
        animation.scale = savedData.scale * this.scale
        animation.speed = savedData.speed
        animation.opacity = savedData.opacity
        animation.priority = savedData.priority
        animation.rawOffsetY = savedData.offsetY
        animation.offsetY = savedData.offsetY * this.scale
        animation.parent = this
        animation.setPosition(this.actor)
        animation.setAngle(savedData.angle)
        if (savedData.motion) {
          animation.defaultMotion = savedData.motion
          animation.setMotion(savedData.motion)
        }
        if (savedData.images) {
          animation.priorityImages = savedData.images
          animation.setSpriteImages(savedData.images)
        }
        this.list.push(animation)
        this.keyMap[animation.key] = animation
      }
    }
  }

  /** 动画组件排序器函数 */
  static sorter = (a, b) => a.priority - b.priority
}

// ******************************** 技能管理器类 ********************************

class SkillManager {
  /** 绑定的角色对象
   *  @type {Actor}
   */ actor

  /** 技能ID映射表
   *  @type {Object}
   */ idMap

  /** 技能冷却列表
   *  @type {CooldownList}
   */ cooldownList

  /** 技能管理器版本(随着技能添加和移除发生变化)
   *  @type {number}
   */ version

  /**
   * 角色技能管理器
   * @param {Actor} actor 绑定的角色对象
   */
  constructor(actor) {
    this.actor = actor
    this.idMap = {}
    this.cooldownList = new SkillCooldownList(actor)
    this.version = 0
  }

  /**
   * 获取角色技能
   * @param {string} id 技能文件ID
   * @returns {Skill|undefined}
   */
  get(id) {
    return this.idMap[id]
  }

  /**
   * 添加角色技能
   * @param {Skill} skill 技能实例
   */
  add(skill) {
    const {id} = skill
    const {idMap} = this
    // 如果不存在该技能，则添加，并触发技能添加事件
    if (!idMap[id]) {
      idMap[id] = skill
      this.version++
      skill.parent = this
      skill.emit('skilladd')
    }
  }

  /**
   * 移除角色技能
   * @param {Skill} skill 技能实例
   */
  remove(skill) {
    const {id} = skill
    const {idMap} = this
    // 如果存在该技能，则移除，并触发技能移除事件
    if (idMap[id] === skill) {
      delete idMap[id]
      this.version++
      skill.emit('skillremove')
      skill.parent = null
    }
  }

  /**
   * 删除角色技能
   * @param {string} id 技能文件ID
   */
  delete(id) {
    // 从管理器中移除指定ID的技能
    const skill = this.idMap[id]
    if (skill) this.remove(skill)
  }

  /** 自动排序技能列表 */
  sort() {
    const idMap = {}
    // 使用idMap创建技能列表，并通过文件名排序
    const list = Object.values(this.idMap).sort(
      (a, b) => a.data.filename.localeCompare(b.data.filename)
    )
    // 遍历技能列表，重构idMap
    const length = list.length
    for (let i = 0; i < length; i++) {
      const skill = list[i]
      idMap[skill.id] = skill
    }
    this.idMap = idMap
    this.version++
  }

  /** 保存技能列表数据 */
  saveData() {
    const skills = Object.values(this.idMap)
    const length = skills.length
    for (let i = 0; i < length; i++) {
      skills[i] = skills[i].saveData()
    }
    return skills
  }

  /**
   * 加载技能列表数据
   * @param {Object[]} skills
   */
  loadData(skills) {
    const dataMap = Data.skills
    const {idMap, cooldownList} = this
    for (const savedData of skills) {
      const id = savedData.id
      const data = dataMap[id]
      if (data) {
        // 重新创建技能实例
        const skill = new Skill(data, savedData)
        idMap[id] = skill
        skill.parent = this
        // 如果技能正在冷却中
        // 添加到技能冷却列表
        if (skill.cooldown !== 0) {
          cooldownList.append(skill)
        }
      }
    }
  }
}

// ******************************** 技能冷却列表类 ********************************

class SkillCooldownList extends Array {
  /** 绑定的角色对象
   *  @type {Actor}
   */ actor

  /**
   * 角色技能冷却列表
   * @param {Actor} actor 绑定的角色对象
   */
  constructor(actor) {
    super()
    this.actor = actor
  }

  /**
   * 添加角色技能
   * @param {Skill} skill 技能实例
   */
  append(skill) {
    // 如果列表为空，延迟将本列表添加到角色的更新器列表中
    if (this.length === 0) {
      Callback.push(() => {
        this.actor.updaters.add(this)
      })
    }
    super.append(skill)
  }

  /**
   * 更新列表中的技能冷却时间
   * @param {number} deltaTime 增量时间(毫秒)
   */
  update(deltaTime) {
    let i = this.length
    // 逆序遍历冷却中的技能
    while (--i >= 0) {
      // 如果冷却结束，则将技能从列表中移除
      if ((this[i].cooldown -= deltaTime) <= 0) {
        this[i].cooldown = 0
        this[i].duration = 0
        this.splice(i, 1)
        // 如果列表为空，延迟将本列表从角色的更新器列表中移除
        if (this.length === 0) {
          Callback.push(() => {
            this.actor.updaters.remove(this)
          })
        }
      }
    }
  }
}

// ******************************** 技能类 ********************************

class Skill {
  /** 技能文件ID
   *  @type {string}
   */ id

  /** 技能文件数据
   *  @type {Object}
   */ data

  /** 技能图标文件ID
   *  @type {string}
   */ icon

  /** 技能图标矩形裁剪区域
   *  @type {Array<number>}
   */ clip

  /** 技能当前冷却时间
   *  @type {number}
   */ cooldown

  /** 技能持续冷却时间
   *  @type {number}
   */ duration

  /** 技能属性映射表
   *  @type {Object}
   */ attributes

  /** 技能事件映射表
   *  @type {Object}
   */ events

  /** 技能脚本管理器
   *  @type {Script}
   */ script

  /** 技能管理器
   *  @type {SkillManager|null}
   */ parent

  /**
   * 角色技能对象
   * @param {SkillFile} data 技能文件数据
   * @param {Object} [savedData] 技能存档数据
   */
  constructor(data, savedData) {
    this.id = data.id
    this.data = data
    this.icon = data.icon
    this.clip = data.clip
    this.cooldown = 0
    this.duration = 0
    this.attributes = null
    this.events = data.events
    this.script = Script.create(this, data.scripts)
    this.parent = null
    Skill.latest = this

    if (savedData) {
      // 加载存档数据
      this.cooldown = savedData.cooldown
      this.duration = savedData.duration
      this.attributes = savedData.attributes
    } else {
      // 初始化
      Attribute.loadEntries(
        this.attributes = {},
        data.attributes,
      )
    }
  }

  /** 读取技能冷却进度 */
  get progress() {
    return this.cooldown === 0 ? 0 : this.cooldown / this.duration
  }

  /** 施放角色技能 */
  cast() {
    // 如果冷却结束且施放角色已激活，返回技能释放事件
    if (this.cooldown === 0 &&
      this.parent?.actor.isActive()) {
      return this.emit('skillcast')
    }
  }

  /**
   * 设置技能的冷却时间
   * @param {number} cooldown 冷却时间(毫秒)
   */
  setCooldown(cooldown) {
    if (cooldown >= 0 &&
      this.cooldown !== cooldown) {
      this.cooldown = cooldown
      this.duration = cooldown
      // 添加技能到冷却列表
      this.parent?.cooldownList.append(this)
    }
  }

  /**
   * 增加技能的冷却时间
   * @param {number} cooldown 冷却时间(毫秒)
   */
  increaseCooldown(cooldown) {
    if (cooldown > 0) {
      this.cooldown += cooldown
      this.duration = Math.max(this.cooldown, this.duration)
      // 添加技能到冷却列表
      this.parent?.cooldownList.append(this)
    }
  }

  /**
   * 减少技能的冷却时间
   * @param {number} cooldown 冷却时间(毫秒)
   */
  decreaseCooldown(cooldown) {
    if (cooldown > 0) {
      this.cooldown = Math.max(this.cooldown - cooldown, 0)
    }
  }

  /** 移除角色技能 */
  remove() {
    this.parent?.remove(this)
  }

  /**
   * 调用技能事件
   * @param {string} type 技能事件类型
   * @returns {EventHandler|undefined}
   */
  callEvent(type) {
    const actor = this.parent?.actor
    const commands = this.events[type]
    switch (type) {
      case 'skilladd':
      case 'skillremove':
        EventManager.emit(type, null, {
          triggerSkill: this,
          triggerActor: actor,
          casterActor: actor,
        })
        break
    }
    if (commands) {
      const event = new EventHandler(commands)
      event.triggerSkill = this
      event.triggerActor = actor
      event.casterActor = actor
      EventHandler.call(event, actor?.updaters)
      return event
    }
  }

  /**
   * 调用技能事件和脚本
   * @param {string} type 技能事件类型
   * @returns {EventHandler|undefined}
   */
  emit(type) {
    const event = this.callEvent(type)
    this.script.emit(type, this)
    return event
  }

  /** 保存技能数据 */
  saveData() {
    return {
      id: this.id,
      cooldown: this.cooldown,
      duration: this.duration,
      attributes: this.attributes,
    }
  }

  /** 最新创建技能
   *  @type {Skill|undefined}
   */ static latest
}

// ******************************** 状态管理器类 ********************************

class StateManager {
  /** 绑定的角色对象
   *  @type {Actor}
   */ actor

  /** 状态ID映射表
   *  @type {Object}
   */ idMap

  /** 状态倒计时列表
   *  @type {StateCountdownList}
   */ countdownList

  /** 状态管理器版本(随着状态添加和移除发生变化)
   *  @type {number}
   */ version

  /**
   * 角色状态管理器
   * @param {Actor} actor 绑定的角色对象
   */
  constructor(actor) {
    this.actor = actor
    this.idMap = {}
    this.countdownList = new StateCountdownList(this)
    this.version = 0
  }

  /**
   * 获取角色状态
   * @param {string} id 状态文件ID
   * @returns {State|undefined}
   */
  get(id) {
    return this.idMap[id]
  }

  /**
   * 添加角色状态
   * @param {State} state 状态实例
   */
  add(state) {
    const {id} = state
    const {idMap} = this
    // 如果存在该状态，先移除
    if (id in idMap) {
      this.remove(idMap[id])
    }
    idMap[id] = state
    this.version++
    this.countdownList.append(state)
    state.parent = this
    state.emit('stateadd')
  }

  /**
   * 移除角色状态
   * @param {State} state 状态实例
   */
  remove(state) {
    const {id} = state
    const {idMap} = this
    // 如果存在该状态，则移除，并触发状态移除事件
    if (idMap[id] === state) {
      delete idMap[id]
      this.version++
      this.countdownList.remove(state)
      state.emit('stateremove')
      state.parent = null
    }
  }

  /**
   * 删除角色状态
   * @param {string} id 状态文件ID
   */
  delete(id) {
    // 从管理器中移除指定ID的状态
    const state = this.idMap[id]
    if (state) this.remove(state)
  }

  /** 保存状态列表数据 */
  saveData() {
    const states = Object.values(this.idMap)
    const length = states.length
    for (let i = 0; i < length; i++) {
      states[i] = states[i].saveData()
    }
    return states
  }

  /**
   * 加载状态列表数据
   * @param {Object[]} states
   */
  loadData(states) {
    for (const savedData of states) {
      const id = savedData.id
      const data = Data.states[id]
      if (data) {
        // 重新创建状态实例
        const state = new State(data, savedData)
        this.countdownList.append(state)
        this.idMap[id] = state
        state.parent = this
      }
    }
  }
}

// ******************************** 状态倒计时列表类 ********************************

class StateCountdownList extends Array {
  /** 绑定的角色对象
   *  @type {Actor}
   */ actor

  /** 状态管理器
   *  @type {StateManager}
   */ manager

  /**
   * 角色状态倒计时列表
   * @param {StateManager} stateManager 角色状态管理器实例
   */
  constructor(stateManager) {
    super()
    this.actor = stateManager.actor
    this.manager = stateManager
  }

  /**
   * 添加角色状态
   * @param {State} state 状态实例
   */
  append(state) {
    if (state.currentTime === 0) return
    // 如果列表为空，延迟将本列表添加到角色的更新器列表中
    if (this.length === 0) {
      Callback.push(() => {
        this.actor.updaters.add(this)
      })
    }
    super.append(state)
  }

  /**
   * 移除角色状态
   * @param {State} state 状态实例
   */
  remove(state) {
    // 如果存在该状态，则移除
    const i = this.indexOf(state)
    if (i !== -1) {
      this.splice(i, 1)
      // 如果列表为空，延迟将本列表从角色的更新器列表中移除
      if (this.length === 0) {
        Callback.push(() => {
          this.actor.updaters.remove(this)
        })
      }
    }
  }

  /**
   * 更新列表中的状态剩余时间
   * @param {number} deltaTime 增量时间(毫秒)
   */
  update(deltaTime) {
    let i = this.length
    // 逆序遍历倒计时中的状态
    while (--i >= 0) {
      const state = this[i]
      state.autorun()
      state.updaters.update(deltaTime)
      // 如果倒计时结束，则将状态从列表中移除
      if ((state.currentTime -= deltaTime) <= 0) {
        state.currentTime = 0
        this.manager.remove(state)
      }
    }
  }
}

// ******************************** 状态类 ********************************

class State {
  /** 状态文件ID
   *  @type {string}
   */ id

  /** 状态文件数据
   *  @type {Object}
   */ data

  /** 状态图标文件ID
   *  @type {string}
   */ icon

  /** 状态图标矩形裁剪区域
   *  @type {Array<number>}
   */ clip

  /** 状态当前时间
   *  @type {number}
   */ currentTime

  /** 状态持续时间
   *  @type {number}
   */ duration

  /** 状态更新器列表
   *  @type {ModuleList}
   */ updaters

  /** 状态属性映射表
   *  @type {Object}
   */ attributes

  /** 技能施放者
   *  @type {Actor|null}
   */ caster

  /** 状态事件映射表
   *  @type {Object}
   */ events

  /** 状态脚本管理器
   *  @type {Script}
   */ script

  /** 状态管理器
   *  @type {StateManager|null}
   */ parent

  /** 已开始状态
   *  @type {boolean}
   */ started

  /**
   * 角色状态对象
   * @param {StateFile} data 状态文件数据
   * @param {Object} [savedData] 状态存档数据
   */
  constructor(data, savedData) {
    this.id = data.id
    this.data = data
    this.icon = data.icon
    this.clip = data.clip
    this.currentTime = 0
    this.duration = 0
    this.updaters = new ModuleList()
    this.attributes = null
    this.caster = null
    this.events = data.events
    this.script = Script.create(this, data.scripts)
    this.parent = null
    this.started = false
    State.latest = this

    if (savedData) {
      // 加载存档数据
      this.currentTime = savedData.currentTime
      this.duration = savedData.duration
      this.attributes = savedData.attributes
      if (savedData.caster) {
        Callback.push(() => {
          this.caster = EntityManager.get(savedData.caster) ?? null
        })
      }
    } else {
      // 初始化
      Attribute.loadEntries(
        this.attributes = {},
        data.attributes,
      )
    }
  }

  /**
   * 设置角色状态的时间
   * @param {number} time 持续时间(毫秒)
   */
  setTime(time) {
    if (time >= 0) {
      this.currentTime = time
      this.duration = time
    }
  }

  /**
   * 增加角色状态的时间
   * @param {number} time 持续时间(毫秒)
   */
  increaseTime(time) {
    if (time > 0) {
      this.currentTime += time
      this.duration = Math.max(this.currentTime, this.duration)
    }
  }

  /**
   * 减少角色状态的时间
   * @param {number} time 持续时间(毫秒)
   */
  decreaseTime(time) {
    if (time > 0) {
      this.currentTime = Math.max(this.currentTime - time, 0)
    }
  }

  /**
   * 调用状态事件
   * @param {string} type 状态事件类型
   * @returns {EventHandler|undefined}
   */
  callEvent(type) {
    const actor = this.parent?.actor
    const caster = this.caster ?? undefined
    const commands = this.events[type]
    switch (type) {
      case 'stateadd':
      case 'stateremove':
        EventManager.emit(type, null, {
          triggerState: this,
          triggerActor: actor,
          casterActor: caster,
        })
        break
    }
    if (commands) {
      const event = new EventHandler(commands)
      event.triggerState = this
      event.triggerActor = actor
      event.casterActor = caster
      EventHandler.call(event, this.updaters)
      return event
    }
  }

  /**
   * 调用状态事件和脚本
   * @param {string} type 状态事件类型
   */
  emit(type) {
    this.callEvent(type)
    this.script.emit(type, this)
  }

  // 自动执行
  autorun() {
    if (this.started === false) {
      this.started = true
      this.emit('autorun')
    }
  }

  /** 保存状态数据 */
  saveData() {
    return {
      id: this.id,
      caster: this.caster?.entityId ?? '',
      currentTime: this.currentTime,
      duration: this.duration,
      attributes: this.attributes,
    }
  }

  /** 最新创建状态
   *  @type {State|undefined}
   */ static latest
}

// ******************************** 装备管理器类 ********************************

class EquipmentManager {
  /** 绑定的角色对象
   *  @type {Actor}
   */ actor

  /** 装备槽->装备映射表
   *  @type {Object}
   */ slotMap

  /** 装备管理器版本(随着装备添加和移除发生变化)
   *  @type {number}
   */ version

  /**
   * 角色装备管理器
   * @param {Actor} actor 绑定的角色对象
   */
  constructor(actor) {
    this.actor = actor
    this.slotMap = {}
    this.version = 0
  }

  /**
   * 获取角色装备
   * @param {string} slot 装备槽
   * @returns {Equipment|undefined}
   */
  get(slot) {
    return this.slotMap[slot]
  }

  /**
   * 设置角色装备
   * @param {string} slot 装备槽
   * @param {Equipment} equipment 装备实例
   */
  set(slot, equipment) {
    if (this.actor.active && slot && equipment.parent !== this) {
      // 先从其他管理器中移除该装备
      equipment.remove()
      // 如果槽已被占用，则移除槽对应的装备
      const slotMap = this.slotMap
      const holder = slotMap[slot]
      if (holder) {
        this.remove(holder)
      }
      // 设置装备槽对应值为该装备，并发送装备添加事件
      slotMap[slot] = equipment
      this.version++
      equipment.slot = slot
      equipment.parent = this
      equipment.emit('equipmentadd')
    }
  }

  /**
   * 移除角色装备
   * @param {Equipment} equipment 装备实例
   */
  remove(equipment) {
    if (this.actor.active && equipment.parent === this) {
      // 从管理器中移除该装备，重置键位，并发送装备移除事件
      delete this.slotMap[equipment.slot]
      this.version++
      equipment.slot = ''
      equipment.emit('equipmentremove')
      equipment.parent = null
      // 在角色库存中插入移除的装备
      this.actor.inventory.insert(equipment)
    }
  }

  /**
   * 删除角色装备
   * @param {string} slot 装备槽
   */
  delete(slot) {
    // 从管理器中移除指定键的装备
    const equipment = this.slotMap[slot]
    if (equipment) this.remove(equipment)
  }

  /**
   * 通过ID获取装备
   * @param {string} equipmentId 装备文件ID
   * @returns {Equipment|undefined} 装备实例
   */
  getById(equipmentId) {
    for (const equipment of Object.values(this.slotMap)) {
      if (equipment.id === equipmentId) return equipment
    }
    return undefined
  }

  /** 保存装备列表数据 */
  saveData() {
    const data = Object.values(this.slotMap)
    const length = data.length
    for (let i = 0; i < length; i++) {
      data[i] = data[i].saveData()
    }
    return data
  }

  /**
   * 加载装备列表数据
   * @param {Object[]} equipments
   */
  loadData(equipments) {
    for (const savedData of equipments) {
      const data = Data.equipments[savedData.id]
      if (data) {
        // 重新创建装备实例
        const equipment = new Equipment(data, savedData)
        equipment.parent = this
        this.slotMap[savedData.slot] = equipment
      }
    }
  }
}

// ******************************** 装备类 ********************************

class Equipment {
  /** 装备文件ID
   *  @type {string}
   */ id

  /** 装备槽
   *  @type {string}
   */ slot

  /** 装备在库存中的位置
   *  如果不在库存中为-1
   *  @type {number}
   */ order

  /** 装备文件数据
   *  @type {Object}
   */ data

  /** 装备图标文件ID
   *  @type {string}
   */ icon

  /** 装备图标矩形裁剪区域
   *  @type {Array<number>}
   */ clip

  /** 装备属性映射表
   *  @type {Object}
   */ attributes

  /** 装备事件映射表
   *  @type {Object}
   */ events
 
  /** 装备脚本管理器
   *  @type {Script}
   */ script
 
  /** 父级对象
   *  @type {Inventory|EquipmentManager|null}
   */ parent

  /**
   * 角色装备对象
   * @param {EquipmentFile} data 装备文件数据
   * @param {Object} [savedData] 装备存档数据
   */
  constructor(data, savedData) {
    this.id = data.id
    this.slot = ''
    this.order = -1
    this.data = data
    this.icon = data.icon
    this.clip = data.clip
    this.attributes = null
    this.events = data.events
    this.script = Script.create(this, data.scripts)
    this.parent = null
    Equipment.latest = this

    if (savedData) {
      // 加载存档数据
      this.slot = savedData.slot
      this.order = savedData.order
      this.attributes = savedData.attributes
    } else {
      // 初始化
      Attribute.loadEntries(
        this.attributes = {},
        data.attributes,
      )
      this.emit('create')
    }
  }

  /**
   * 穿上角色装备(共享库存的代价：需要传递事件触发角色)
   * @param {string} slot 装备槽
   * @param {Actor} [actor] 事件触发角色
   */
  equip(slot, actor = this.parent?.actor) {
    if (this.parent instanceof Inventory) {
      actor?.equipmentManager.set(slot, this)
    }
  }

  /** 移除角色装备 */
  remove() {
    this.parent?.remove(this)
  }

  /**
   * 调用装备事件
   * @param {string} type 装备事件类型
   * @returns {EventHandler|undefined}
   */
  callEvent(type) {
    const actor = this.parent?.actor
    const commands = this.events[type]
    switch (type) {
      case 'equipmentadd':
      case 'equipmentremove':
      case 'equipmentgain':
        EventManager.emit(type, null, {
          triggerActor: actor,
          triggerEquipment: this,
        })
        break
    }
    if (commands) {
      const event = new EventHandler(commands)
      event.triggerActor = actor
      event.triggerEquipment = this
      EventHandler.call(event, actor?.updaters)
      return event
    }
  }

  /**
   * 调用装备事件和脚本
   * @param {string} type 装备事件类型
   * @param {Actor} [actor] 事件触发角色
   */
  emit(type, actor) {
    this.callEvent(type, actor)
    this.script.emit(type, this)
  }

  /** 保存装备数据 */
  saveData() {
    return {
      id: this.id,
      slot: this.slot,
      order: this.order,
      attributes: this.attributes,
    }
  }

  /** 最新创建装备
   *  @type {Equipment|undefined}
   */ static latest
}

// ******************************** 物品类 ********************************

class Item {
  /** 物品文件ID
   *  @type {string}
   */ id

  /** 物品在库存中的位置
   *  如果不在库存中为-1
   *  @type {number}
   */ order

  /** 物品文件数据
   *  @type {Object}
   */ data

  /** 物品图标文件ID
   *  @type {string}
   */ icon

  /** 物品图标矩形裁剪区域
   *  @type {Array<number>}
   */ clip
  
  /** 物品数量
   *  @type {number}
   */ quantity

  /** 物品属性映射表
   *  @type {Object}
   */ attributes

  /** 物品事件映射表
   *  @type {Object}
   */ events
 
  /** 物品脚本管理器
   *  @type {Script}
   */ script
 
  /** 父级对象
   *  @type {Inventory|null}
   */ parent

  /**
   * 角色物品对象
   * @param {ItemFile} data 物品文件数据
   * @param {Object} [savedData] 物品存档数据
   */
  constructor(data, savedData) {
    this.id = data.id
    this.order = -1
    this.data = data
    this.icon = data.icon
    this.clip = data.clip
    this.quantity = 0
    this.attributes = data.attributes
    this.events = data.events
    this.script = Script.create(this, data.scripts)
    this.parent = null

    if (savedData) {
      // 加载存档数据
      this.order = savedData.order
      this.quantity = savedData.quantity
    }
  }

  /**
   * 使用角色物品
   * @param {Actor|undefined} actor 
   * @returns {EventHandler|undefined}
   */
  use(actor = this.parent?.actor) {
    // 如果数量大于0，则返回物品使用事件
    if (this.quantity > 0 && actor?.isActive()) {
      return this.emit('itemuse', actor)
    }
  }

  /**
   * 增加物品的数量
   * @param {number} quantity 物品数量
   */
  increase(quantity) {
    const {parent} = this
    if (parent && quantity > 0) {
      this.quantity += quantity
      parent.version++
    }
  }

  /**
   * 减少物品的数量，当物品数量不够时将被从库存中移除
   * @param {number} quantity 物品数量
   */
  decrease(quantity) {
    const {parent} = this
    if (parent && quantity > 0) {
      this.quantity -= quantity
      // 如果物品数量不足，则移除
      if (this.quantity <= 0) {
        this.quantity = 0
        this.remove()
      }
      parent.version++
    }
  }

  /** 将货物从库存中移除 */
  remove() {
    this.parent?.remove(this)
  }

  /**
   * 调用物品事件(共享库存的代价：需要传递事件触发角色)
   * @param {string} type 物品事件类型
   * @param {Actor} [actor] 事件触发角色
   * @returns {EventHandler|undefined}
   */
  callEvent(type, actor = this.parent?.actor) {
    const commands = this.events[type]
    switch (type) {
      case 'itemgain':
        EventManager.emit(type, null, {
          triggerActor: actor,
          triggerItem: this,
        })
        break
    }
    if (commands) {
      const event = new EventHandler(commands)
      event.triggerActor = actor
      event.triggerItem = this
      EventHandler.call(event, actor?.updaters)
      return event
    }
  }

  /**
   * 调用物品事件和脚本
   * @param {string} type 物品事件类型
   * @param {Actor} [actor] 事件触发角色
   * @returns 
   */
  emit(type, actor) {
    const event = this.callEvent(type, actor)
    this.script.emit(type, this)
    return event
  }

  /** 保存物品数据 */
  saveData() {
    return {
      id: this.id,
      order: this.order,
      quantity: this.quantity,
    }
  }

  // 静态 - 最新获得物品
  static latest

  // 静态 - 最新获得物品的增量
  static increment = 0
}

// ******************************** 库存类 ********************************

class Inventory {
  /** 绑定的角色对象
   *  @type {Actor}
   */ actor

  /** 库存中的金钱
   *  @type {number}
   */ money

  /** 预测下一个空槽的插入位置
   *  @type {number}
   */ pointer

  /** 库存中的货物数量
   *  @type {number}
   */ size

  /** 库存货物列表
   *  @type {Array<Item|Equipment>}
   */ list

  /** ID->货物集合映射表
   *  @type {Object}
   */ idMap

  /** 库存管理器版本(随着货物添加和移除发生变化)
   *  @type {number}
   */ version

  /**
   * 角色库存管理器
   * @param {Actor} actor 绑定的角色对象
   */
  constructor(actor) {
    this.actor = actor
    this.money = 0
    this.pointer = 0
    this.size = 0
    this.list = []
    this.idMap = {}
    this.version = 0
  }

  /**
   * 获取库存货物
   * @param {string} id 物品文件ID
   * @returns {Item|Equipment|undefined}
   */
  get(id) {
    return this.idMap[id]?.[0]
  }

  /**
   * 获取库存货物列表
   * @param {string} id 物品文件ID
   * @returns {Array<Item>|Array<Equipment>|undefined}
   */
  getList(id) {
    return this.idMap[id]
  }

  /** 重置库存中的物品、装备、金币 */
  reset() {
    // 遍历库存中的所有物品装备，重置属性
    for (const goods of this.list) {
      goods.parent = null
      goods.order = -1
    }
    // 重置库存属性
    this.money = 0
    this.pointer = 0
    this.size = 0
    this.list = []
    this.idMap = {}
    this.version++
  }

  /**
   * 插入物品或装备到库存中的空位置
   * @param {Item|Equipment} goods 插入对象
   */
  insert(goods) {
    if (goods.parent === null) {
      // 将物品插入到空槽位
      let i = this.pointer
      const {list} = this
      while (list[i]?.order === i) {i++}
      list.splice(i, 0, goods)
      goods.order = i
      goods.parent = this
      // 将物品添加到映射表
      this.addToMap(goods)
      // 设置空槽位起始查找位置
      this.pointer = i + 1
      this.size++
      this.version++
    }
  }

  /**
   * 从库存中移除物品或装备
   * @param {Item|Equipment} goods 移除对象
   */
  remove(goods) {
    if (goods.parent === this) {
      const {list} = this
      const i = list.indexOf(goods)
      list.splice(i, 1)
      goods.order = -1
      goods.parent = null
      // 将物品从映射表中移除
      this.removeFromMap(goods)
      // 设置空槽位起始查找位置
      if (this.pointer > i) {
        this.pointer = i
      }
      this.size--
      this.version++
    }
  }

  /**
   * 添加物品或装备到映射表
   * @param {Item|Equipment} goods 添加对象
   */
  addToMap(goods) {
    if (this.idMap[goods.id]) {
      this.idMap[goods.id].push(goods)
    } else {
      this.idMap[goods.id] = [goods]
    }
  }

  /**
   * 从映射表中移除物品或装备
   * @param {Item|Equipment} goods 移除对象
   */
  removeFromMap(goods) {
    this.idMap[goods.id].remove(goods)
    if (this.idMap[goods.id].length === 0) {
      delete this.idMap[goods.id]
    }
  }

  /**
   * 交换物品或装备(如果存在)在库存中的位置
   * @param {number} order1 货物1的位置
   * @param {number} order2 货物2的位置
   */
  swap(order1, order2) {
    if (order1 >= 0 && order2 >= 0 && order1 !== order2) {
      // 确保order1小于order2
      if (order1 > order2) {
        const temp = order1
        order1 = order2
        order2 = temp
      }
      const {list} = this
      const goods1 = list.find(a => a.order === order1)
      const goods2 = list.find(a => a.order === order2)
      if (goods1 && goods2) {
        // 同时存在两个物品
        const pos1 = list.indexOf(goods1)
        const pos2 = list.indexOf(goods2)
        goods1.order = order2
        goods2.order = order1
        list[pos1] = goods2
        list[pos2] = goods1
        this.version++
      } else if (goods1) {
        // 存在索引较小的物品
        const pos1 = list.indexOf(goods1)
        list.splice(pos1, 1)
        let pos2 = pos1
        const {length} = list
        while (pos2 < length) {
          if (list[pos2].order > order2) {
            break
          }
          pos2++
        }
        goods1.order = order2
        list.splice(pos2, 0, goods1)
        this.version++
        // 设置空槽位起始查找位置
        if (this.pointer > pos1) {
          this.pointer = pos1
        }
      } else if (goods2) {
        // 存在索引较大的物品
        const pos2 = list.indexOf(goods2)
        list.splice(pos2, 1)
        let pos1 = pos2
        while (--pos1 >= 0) {
          if (list[pos1].order < order1) {
            pos1++
            break
          }
        }
        pos1 = Math.max(pos1, 0)
        goods2.order = order1
        list.splice(pos1, 0, goods2)
        this.version++
      }
    }
  }

  /**
   * 排序库存中的对象
   * @param {boolean} [byOrder = false] 如果设置为true，则物品优先于装备，通过文件名排序
   */
  sort(byOrder = false) {
    const {list} = this
    const {length} = list
    // 如果通过文件名排序
    if (byOrder) list.sort((a, b) => {
      const typeA = typeof a.quantity
      const typeB = typeof b.quantity
      // 物品优先于装备，然后再比较文件名
      if (typeA !== typeB) {
        return typeA === 'number' ? -1 : 1
      }
      return a.data.filename.localeCompare(b.data.filename)
    })
    // 遍历物品列表，更新索引
    for (let i = 0; i < length; i++) {
      list[i].order = i
    }
    this.pointer = length
    this.version++
  }

  /**
   * 查找指定的物品或装备数量
   * @param {string} id 物品或装备的文件ID
   * @returns {number}
   */
  count(id) {
    const list = this.getList(id)
    if (!list) return 0
    let count = 0
    for (const goods of list) {
      count += goods.quantity ?? 1
    }
    return count
  }

  // 
  /**
   * 增加库存中的金钱
   * @param {number} money 金钱数量
   */
  increaseMoney(money) {
    this.money += Math.max(money, 0)
    Inventory.moneyIncrement = money
    EventManager.emit('moneygain', null, {
      triggerActor: this.actor,
    })
  }

  /**
   * 减少库存中的金钱
   * @param {number} money 金钱数量
   */
  decreaseMoney(money) {
    this.money -= Math.max(money, 0)
  }

  /**
   * 在库存中创建物品实例
   * @param {string} id 物品文件ID
   * @param {number} quantity 物品数量
   */
  createItems(id, quantity) {
    const data = Data.items[id]
    if (data && quantity > 0) {
      const item = new Item(data)
      // 插入到库存
      Item.latest = item
      Item.increment = quantity
      this.insert(item)
      item.increase(quantity)
      item.callEvent('itemgain')
    }
  }

  /**
   * 在库存中增加物品数量(如果找不到物品，新建一个实例)
   * @param {string} id 物品文件ID
   * @param {number} quantity 物品数量
   */
  increaseItems(id, quantity) {
    const item = this.get(id)
    // 如果存在该物品，则增加数量，否则创建物品
    if (item) {
      Item.latest = item
      Item.increment = quantity
      item.increase(quantity)
      item.callEvent('itemgain')
    }
    else {
      this.createItems(id, quantity)
    }
  }

  /**
   * 在库存中减少物品数量(从多个物品实例中减去足够的数量)
   * @param {string} id 物品文件ID
   * @param {number} quantity 物品数量
   */
  decreaseItems(id, quantity) {
    const {list} = this
    let i = list.length
    while (--i >= 0) {
      const item = list[i]
      if (item.id === id) {
        // 查找物品并减少数量
        if (item.quantity >= quantity) {
          item.decrease(quantity)
          return
        }
        // 如果数量不够，继续查找
        quantity -= item.quantity
        item.decrease(item.quantity)
      }
    }
  }

  /**
   * 在库存中创建装备实例(通过文件ID)
   * @param {string} id 装备文件ID
   */
  createEquipment(id) {
    const data = Data.equipments[id]
    if (data) {
      this.gainEquipment(new Equipment(data))
    }
  }

  /**
   * 从库存中删除装备实例(通过文件ID)
   * @param {string} id 装备文件ID
   */
  deleteEquipment(id) {
    const equipment = this.get(id)
    if (equipment instanceof Equipment) {
      this.loseEquipment(equipment)
    }
  }

  /**
   * 添加装备实例到库存
   * @param {Equipment} equipment 装备实例
   */
  gainEquipment(equipment) {
    if (equipment.parent !== this) {
      equipment.remove()
      this.insert(equipment)
      equipment.callEvent('equipmentgain')
    }
  }

  /**
   * 从库存中移除装备实例
   * @param {Equipment} equipment 装备实例
   */
  loseEquipment(equipment) {
    if (equipment.parent === this) {
      this.remove(equipment)
    }
  }

  /** 保存库存数据 */
  saveData(actor) {
    if (this.actor !== actor) {
      return {
        ref: this.actor.data.id,
        ...actor.savedInventory.saveData(actor),
      }
    }
    const {list} = this
    const {length} = list
    const data = new Array(length)
    for (let i = 0; i < length; i++) {
      data[i] = list[i].saveData()
    }
    return {
      list: data,
      money: this.money,
    }
  }

  /**
   * 加载库存数据
   * @param {Object} inventory
   */
  loadData(inventory) {
    if ('ref' in inventory) {
      Inventory.references.push({
        actor: this.actor,
        ref: inventory.ref,
      })
    }
    const {list} = this
    for (const savedData of inventory.list) {
      const {id} = savedData
      if ('quantity' in savedData) {
        // 如果是物品数据
        const data = Data.items[id]
        if (data) {
          // 重新创建物品实例
          const item = new Item(data, savedData)
          item.parent = this
          list.push(item)
          this.addToMap(item)
          this.size++
        }
      } else {
        // 如果是装备数据
        const data = Data.equipments[id]
        if (data) {
          // 重新创建装备实例
          const equipment = new Equipment(data, savedData)
          equipment.parent = this
          list.push(equipment)
          this.addToMap(equipment)
          this.size++
        }
      }
    }
    this.money = inventory.money
    // 设置空槽位起始查找位置
    let i = 0
    while (list[i]?.order === i) {i++}
    this.pointer = i
  }

  // 金钱增量
  static moneyIncrement = 0

  // 引用库存延迟处理列表
  static references = []

  // 恢复库存引用
  static reference() {
    for (const {actor, ref} of this.references) {
      const target = ActorManager.get(ref)
      if (target instanceof GlobalActor) {
        actor.useInventory(target.inventory)
      }
    }
  }
}

// ******************************** 快捷栏管理器类 ********************************

class ShortcutManager {
  /** 绑定的角色对象
   *  @type {Actor}
   */ actor

  /** 快捷键映射表
   *  @type {Object}
   */ keyMap

  /** 快捷栏管理器版本(随着快捷键的设置和删除发生变化)
   *  @type {number}
   */ version

  constructor(actor) {
    this.actor = actor
    this.keyMap = {}
    this.version = 0
  }

  /**
   * 获取快捷栏重映射数据
   * @param {string} key 快捷键
   * @returns {Object|undefined}
   */
  get(key) {
    return this.keyMap[key]
  }

  /**
   * 获取快捷栏物品
   * @param {string} key 快捷键
   * @returns {Item|undefined}
   */
  getItem(key) {
    const shortcut = this.keyMap[key]
    if (shortcut?.type === 'item') {
      return this.actor.inventory.get(shortcut.id)
    }
    return undefined
  }

  /**
   * 获取快捷栏技能
   * @param {string} key 快捷键
   * @returns {Skill|undefined}
   */
  getSkill(key) {
    const shortcut = this.keyMap[key]
    if (shortcut?.type === 'skill') {
      return this.actor.skillManager.get(shortcut.id)
    }
    return undefined
  }

  /**
   * 获取快捷栏目标对象
   * @param {string} key 快捷键
   * @returns {Skill|Item|undefined}
   */
  getTarget(key) {
    const shortcut = this.keyMap[key]
    switch (shortcut?.type) {
      case 'skill':
        return this.actor.skillManager.get(shortcut.id)
      case 'item':
        return this.actor.inventory.get(shortcut.id)
      default:
        return undefined
    }
  }

  /**
   * 设置快捷栏项目
   * @param {string} key 快捷键
   * @param {Item|Skill} 物品或技能实例
   */
  set(key, target) {
    if (!key) return
    if (target instanceof Skill) {
      this.keyMap[key] = new Shortcut('skill', key, target.id, target.data)
      this.version++
      return
    }
    if (target instanceof Item) {
      this.keyMap[key] = new Shortcut('item', key, target.id, target.data)
      this.version++
      return
    }
  }

  /**
   * 设置快捷栏项目(文件ID)
   * @param {string} key 快捷键
   * @param {string} 物品或技能的文件ID
   */
  setId(key, id) {
    if (id in Data.skills) {
      this.keyMap[key] = new Shortcut('skill', key, id, Data.skills[id])
      this.version++
      return
    }
    if (id in Data.items) {
      this.keyMap[key] = new Shortcut('item', key, id, Data.items[id])
      this.version++
      return
    }
  }

  /**
   * 删除快捷栏项目
   * @param {string} key 快捷键
   */
  delete(key) {
    if (key in this.keyMap) {
      delete this.keyMap[key]
      this.version++
    }
  }

  /**
   * 交换快捷栏项目
   * @param {string} sKey 源快捷键
   * @param {string} dKey 目标快捷键
   */
  swap(sKey, dKey) {
    if (sKey !== dKey && sKey && dKey) {
      const map = this.keyMap
      const sItem = map[sKey]
      const dItem = map[dKey]
      if (sItem) {
        sItem.key = dKey
        map[dKey] = sItem
      } else {
        delete map[dKey]
      }
      if (dItem) {
        dItem.key = sKey
        map[sKey] = dItem
      } else {
        delete map[sKey]
      }
      this.version++
    }
  }

  /** 保存快捷栏数据 */
  saveData() {
    const list = Object.values(this.keyMap)
    const length = list.length
    const data = new Array(length)
    for (let i = 0; i < length; i++) {
      const shortcut = list[i]
      data[i] = {
        key: shortcut.key,
        id: shortcut.id,
      }
    }
    return data
  }

  /**
   * 加载快捷栏数据
   * @param {Array} shortcuts
   */
  loadData(shortcuts) {
    for (const shortcut of shortcuts) {
      this.setId(shortcut.key, shortcut.id)
    }
  }
}

// ******************************** 快捷栏项目类 ********************************

class Shortcut {
  /** 类型
   *  @type {string}
   */ type

  /** 快捷键
   *  @type {string}
   */ key

  /** 数据ID
   *  @type {string}
   */ id

  /** 目标文件数据
   *  @type {Object}
   */ data

  /** 图标文件ID
   *  @type {string}
   */ icon

  /** 图标矩形裁剪区域
   *  @type {Array<number>}
   */ clip

  /**
   * 快捷栏项目
   * @param {string} type 类型
   * @param {string} key 快捷键
   * @param {string} id 数据ID
   * @param {Object} data 目标对象的文件数据
   */
  constructor(type, key, id, data) {
    this.type = type
    this.key = key
    this.id = id
    this.data = data
    this.icon = data.icon
    this.clip = data.clip
  }
}

// ******************************** 冷却(GCD)管理器类 ********************************

class CooldownManager {
  /** 绑定的角色对象
   *  @type {Actor}
   */ actor

  /** 冷却键->冷却项目映射表
   *  @type {Object}
   */ keyMap

  /** 冷却项目列表
   *  @type {Array<CooldownItem>}
   */ cooldownList

  /**
   * 角色公共冷却管理器
   * @param {Actor} actor 绑定的角色对象
   */
  constructor(actor) {
    this.actor = actor
    this.keyMap = {}
    this.cooldownList = []
  }

  /**
   * 获取冷却项目
   * @param {string} key 冷却键
   * @returns {CooldownItem|undefined}
   */
  get(key) {
    return this.keyMap[key]
  }

  /**
   * 创建冷却项目
   * @param {string} key 冷却键
   * @returns {CooldownItem}
   */
  create(key) {
    let item = this.keyMap[key]
    // 如果不存在冷却项目，则新建一个
    if (item === undefined) {
      // 如果列表为空，延迟将本列表添加到角色的更新器列表中
      if (this.cooldownList.length === 0) {
        Callback.push(() => {
          this.actor.updaters.add(this)
        })
      }
      // 创建冷却项目
      item = new CooldownItem(key)
      this.keyMap[key] = item
      this.cooldownList.append(item)
    }
    return item
  }

  /**
   * 删除冷却项目
   * @param {string} key 冷却键
   */
  delete(key) {
    const item = this.keyMap[key]
    if (item) {
      delete this.keyMap[key]
      this.cooldownList.remove(item)
      // 如果列表为空，延迟将本列表从角色的更新器列表中移除
      if (this.cooldownList.length === 0) {
        Callback.push(() => {
          this.actor.updaters.remove(this)
        })
      }
    }
  }

  /**
   * 设置冷却时间
   * @param {string} key 冷却键
   * @param {number} cooldown 冷却时间
   */
  setCooldown(key, cooldown) {
    if (key && cooldown > 0) {
      const item = this.create(key)
      item.cooldown = cooldown
      item.duration = cooldown
    }
  }

  /**
   * 增加冷却时间
   * @param {string} key 冷却键
   * @param {number} cooldown 冷却时间
   */
  increaseCooldown(key, cooldown) {
    if (key && cooldown > 0) {
      const item = this.create(key)
      item.cooldown += cooldown
      item.duration = Math.max(item.cooldown, item.duration)
    }
  }

  /**
   * 减少冷却时间
   * @param {string} key 冷却键
   * @param {number} cooldown 冷却时间
   */
  decreaseCooldown(key, cooldown) {
    const item = this.keyMap[key]
    if (item && cooldown > 0) {
      item.cooldown -= cooldown
      // 如果冷却结束，删除键
      if (item.cooldown <= 0) {
        this.delete(key)
      }
    }
  }

  /**
   * 更新公共冷却时间
   * @param {number} deltaTime 增量时间(毫秒)
   */
  update(deltaTime) {
    const {cooldownList} = this
    let i = cooldownList.length
    // 逆序遍历冷却列表
    while (--i >= 0) {
      // 如果冷却结束，删除键
      if ((cooldownList[i].cooldown -= deltaTime) <= 0) {
        this.delete(cooldownList[i].key)
      }
    }
  }

  /** 保存公共冷却列表数据 */
  saveData() {
    return this.cooldownList
  }

  /**
   * 加载公共冷却列表数据
   * @param {Array} cooldowns
   */
  loadData(cooldowns) {
    if (cooldowns.length !== 0) {
      // 重构冷却列表
      for (const cooldown of cooldowns) {
        const instance = new CooldownItem(cooldown.key)
        instance.cooldown = cooldown.cooldown
        instance.duration = cooldown.duration
        this.keyMap[cooldown.key] = instance
        this.cooldownList.push(instance)
      }
      this.actor.updaters.add(this)
    }
  }
}

// ******************************** 公共冷却项目类 ********************************

class CooldownItem {
  /** 冷却键
   *  @type {string}
   */ key

  /** 当前冷却时间
   *  @type {number}
   */ cooldown

  /** 持续冷却时间
   *  @type {number}
   */ duration

  /**
   * 公共冷却项目
   * @param {string} key 冷却键
   */
  constructor(key) {
    this.key = key
    this.cooldown = 0
    this.duration = 0
  }

  /** 读取公共冷却进度 */
  get progress() {
    return this.cooldown / this.duration
  }
}

// ******************************** 角色目标管理器类 ********************************

class TargetManager {
  /** 绑定的角色对象
   *  @type {Actor}
   */ actor

  /** 目标角色列表
   *  @type {Array<Actor>}
   */ targets

  /** 仇恨值数据列表
   *  @type {Array<number>}
   */ threats

  /** 相关目标角色列表
   *  @type {Array<Actor>}
   */ relatedTargets

  /**
   * 角色目标管理器
   * @param {Actor} actor 绑定的角色对象
   */
  constructor(actor) {
    this.actor = actor
    this.targets = []
    this.threats = []
    this.relatedTargets = []
  }

  /**
   * 增加对目标角色的仇恨值，如果还不是目标，则将他放到目标列表中
   * @param {Actor} actor 目标角色
   * @param {number} threat 增加的仇恨值
   */
  increaseThreat(actor, threat) {
    const index = this.targets.indexOf(actor)
    if (index !== -1) {
      // 如果存在目标角色，增加仇恨值
      this.threats[index] += threat
    } else if (actor.active) {
      // 如果不存在目标角色，且目标角色已激活
      // 添加目标角色和仇恨值，并让目标角色将自己添加为相关目标
      this.targets.push(actor)
      this.threats.push(threat)
      actor.targetManager.relatedTargets.push(this.actor)
    }
  }

  /**
   * 减少对目标角色的仇恨值
   * @param {Actor} actor 目标角色
   * @param {number} threat 减少的仇恨值
   */
  decreaseThreat(actor, threat) {
    const index = this.targets.indexOf(actor)
    if (index !== -1) {
      // 如果存在目标角色，减少仇恨值
      this.threats[index] = Math.max(this.threats[index] - threat, 0)
    }
  }

  /**
   * 探测目标角色，将符合条件的角色添加到目标列表中
   * @param {number} distance 探测距离(单位:图块)
   * @param {function} inspector 目标角色检查器
   * @param {boolean} [inSight = false] 是否判断目标角色在视野中可见
   */
  detect(distance, inspector, inSight = false) {
    const owner = this.actor
    const ox = owner.x
    const oy = owner.y
    // 获取探测范围所在的角色区间列表
    const cells = Scene.actors.cells.get(
      ox - distance,
      oy - distance,
      ox + distance,
      oy + distance,
    )
    const square = distance ** 2
    const count = cells.count
    // 查找所有角色区间
    for (let i = 0; i < count; i++) {
      const actors = cells[i]
      const length = actors.length
      // 查找区间中的所有角色
      for (let i = 0; i < length; i++) {
        const actor = actors[i]
        // 如果角色已激活，距离小于等于探测距离，且符合条件，则把该角色添加到目标列表中
        if (actor.active && (ox - actor.x) ** 2 + (oy - actor.y) ** 2 <= square &&
          inspector(owner, actor) && (inSight === false ||
          actor.parent.scene.isInLineOfSight(ox, oy, actor.x, actor.y))) {
          this.append(actor)
        }
      }
    }
  }

  /**
   * 放弃远处的目标角色
   * @param {function} inspector 目标角色检查器
   * @param {number} distance 如果与目标角色的距离达到这个阈值，将他从目标列表中移除
   */
  discard(inspector, distance = 0) {
    const owner = this.actor
    const ox = owner.x
    const oy = owner.y
    const square = distance ** 2
    const targets = this.targets
    let i = targets.length
    // 逆序查找目标列表中的所有角色
    while (--i >= 0) {
      const actor = targets[i]
      // 如果角色符合条件，且距离大于等于放弃距离，则把该角色从目标列表中移除
      if (inspector(owner, actor) && (ox - actor.x) ** 2 + (oy - actor.y) ** 2 >= square) {
        this.remove(actor)
      }
    }
  }

  /** 重置角色目标管理器 */
  reset() {
    this.resetTargets()
    this.resetRelatedTargets()
  }

  /** 重置目标角色列表 */
  resetTargets() {
    const targets = this.targets
    const length = targets.length
    if (length !== 0) {
      const owner = this.actor
      // 遍历所有目标，将本角色从它们的相关列表中删除
      for (let i = 0; i < length; i++) {
        targets[i].targetManager.relatedTargets.remove(owner)
      }
      // 重置目标和仇恨值列表
      this.targets = []
      this.threats = []
    }
  }

  /** 重置相关目标角色列表 */
  resetRelatedTargets() {
    const relatedTargets = this.relatedTargets
    const length = relatedTargets.length
    if (length !== 0) {
      const owner = this.actor
      // 遍历所有相关目标，将本角色从它们的目标和仇恨值列表中删除
      for (let i = 0; i < length; i++) {
        const actor = relatedTargets[i]
        const manager = actor.targetManager
        const targets = manager.targets
        const threats = manager.threats
        const index = targets.indexOf(owner)
        if (index !== -1) {
          targets.splice(index, 1)
          threats.splice(index, 1)
        }
      }
      // 重置相关列表
      this.relatedTargets = []
    }
  }

  /**
   * 添加角色到目标列表中
   * @param {Actor} actor 目标角色
   */
  append(actor) {
    const index = this.targets.indexOf(actor)
    if (index === -1) {
      // 如果不存在该目标，则添加目标和仇恨值
      // 并让目标角色将本角色添加到相关列表
      this.targets.push(actor)
      this.threats.push(0)
      actor.targetManager.relatedTargets.push(this.actor)
    }
  }

  /**
   * 从目标列表中移除角色
   * @param {Actor} actor 目标角色
   */
  remove(actor) {
    const index = this.targets.indexOf(actor)
    if (index !== -1) {
      // 如果存在该目标，则移除目标和仇恨值
      // 并让目标角色将本角色从相关列表中移除
      this.targets.splice(index, 1)
      this.threats.splice(index, 1)
      actor.targetManager.relatedTargets.remove(this.actor)
    }
  }

  /**
   * 获取目标角色 - 最大仇恨值
   * @param {function} inspector 目标角色检查器
   * @returns {Actor|undefined}
   */
  getTargetMaxThreat(inspector) {
    let target
    let weight = -1
    const owner = this.actor
    const targets = this.targets
    const threats = this.threats
    const length = targets.length
    for (let i = 0; i < length; i++) {
      const actor = targets[i]
      // 检查角色关系，并找出最大仇恨值的目标
      if (inspector(owner, actor)) {
        const threat = threats[i]
        if (threat > weight) {
          target = actor
          weight = threat
        }
      }
    }
    return target
  }

  /**
   * 获取目标角色 - 最近距离
   * @param {function} inspector 目标角色检查器
   * @returns {Actor|undefined}
   */
  getTargetNearest(inspector) {
    let target
    let weight = Infinity
    const owner = this.actor
    const targets = this.targets
    const length = targets.length
    for (let i = 0; i < length; i++) {
      const actor = targets[i]
      // 检查角色关系，并找出最近距离的目标
      if (inspector(owner, actor)) {
        const distance = Math.dist(owner.x, owner.y, actor.x, actor.y)
        if (distance < weight) {
          target = actor
          weight = distance
        }
      }
    }
    return target
  }

  /**
   * 获取目标角色 - 最远距离
   * @param {function} inspector 目标角色检查器
   * @returns {Actor|undefined}
   */
  getTargetFarthest(inspector) {
    let target
    let weight = -Infinity
    const owner = this.actor
    const targets = this.targets
    const length = targets.length
    for (let i = 0; i < length; i++) {
      const actor = targets[i]
      // 检查角色关系，并找出最远距离的目标
      if (inspector(owner, actor)) {
        const distance = Math.dist(owner.x, owner.y, actor.x, actor.y)
        if (distance > weight) {
          target = actor
          weight = distance
        }
      }
    }
    return target
  }

  /**
   * 获取目标角色 - 最小属性值
   * @param {function} inspector 目标角色检查器
   * @returns {Actor|undefined}
   */
  getTargetMinAttributeValue(inspector, key) {
    let target
    let weight = Infinity
    const owner = this.actor
    const targets = this.targets
    const length = targets.length
    for (let i = 0; i < length; i++) {
      const actor = targets[i]
      // 检查角色关系，并找出最小属性值的目标
      if (inspector(owner, actor)) {
        const value = actor.attributes[key]
        if (value < weight) {
          target = actor
          weight = value
        }
      }
    }
    return target
  }

  /**
   * 获取目标角色 - 最大属性值
   * @param {function} inspector 目标角色检查器
   * @returns {Actor|undefined}
   */
  getTargetMaxAttributeValue(inspector, key) {
    let target
    let weight = -Infinity
    const owner = this.actor
    const targets = this.targets
    const length = targets.length
    for (let i = 0; i < length; i++) {
      const actor = targets[i]
      // 检查角色关系，并找出最大属性值的目标
      if (inspector(owner, actor)) {
        const value = actor.attributes[key]
        if (value > weight) {
          target = actor
          weight = value
        }
      }
    }
    return target
  }

  /**
   * 获取目标角色 - 最小属性比率
   * @param {function} inspector 目标角色检查器
   * @returns {Actor|undefined}
   */
  getTargetMinAttributeRatio(inspector, key, divisor) {
    let target
    let weight = Infinity
    const owner = this.actor
    const targets = this.targets
    const length = targets.length
    for (let i = 0; i < length; i++) {
      const actor = targets[i]
      // 检查角色关系，并找出最小属性比率的目标
      if (inspector(owner, actor)) {
        const attributes = actor.attributes
        const ratio = attributes[key] / attributes[divisor]
        if (ratio < weight) {
          target = actor
          weight = ratio
        }
      }
    }
    return target
  }

  /**
   * 获得目标角色 - 最大属性比率
   * @param {function} inspector 目标角色检查器
   * @returns {Actor|undefined}
   */
  getTargetMaxAttributeRatio(inspector, key, divisor) {
    let target
    let weight = -Infinity
    const owner = this.actor
    const targets = this.targets
    const length = targets.length
    for (let i = 0; i < length; i++) {
      const actor = targets[i]
      // 检查角色关系，并找出最大属性值的目标
      if (inspector(owner, actor)) {
        const attributes = actor.attributes
        const ratio = attributes[key] / attributes[divisor]
        if (ratio > weight) {
          target = actor
          weight = ratio
        }
      }
    }
    return target
  }

  /**
   * 获取目标角色 - 随机
   * @param {function} inspector 目标角色检查器
   * @returns {Actor|undefined}
   */
  getTargetRandom(inspector) {
    let target
    let count = 0
    const owner = this.actor
    const targets = this.targets
    const indices = GL.arrays[0].uint32
    const length = targets.length
    for (let i = 0; i < length; i++) {
      // 检查角色关系，把索引保存在indices中
      if (inspector(owner, targets[i])) {
        indices[count++] = i
      }
    }
    if (count !== 0) {
      // 获取随机索引指向的角色
      target = targets[indices[Math.floor(Math.random() * count)]]
    }
    return target
  }
}

// ******************************** 角色动画控制器类 ********************************

class AnimationController {
  /** 角色动画状态
   *  @type {string}
   */ state

  /** 角色动画控制器是否已激活
   *  @type {boolean}
   */ active

  /** 角色动画正在播放中
   *  @type {boolean}
   */ playing

  /** 绑定的角色对象
   *  @type {Actor}
   */ actor

  /** 绑定的角色动画
   *  @type {Animation|null}
   */ animation

  /** 角色动画闲置动作名称
   *  @type {string}
   */ idleMotion

  /** 角色动画移动动作名称
   *  @type {string}
   */ moveMotion

  /**
   * 角色动画控制器
   * @param {Actor} actor 绑定的角色对象
   */
  constructor(actor) {
    const {data} = actor
    this.state = 'idle'
    this.active = true
    this.playing = false
    this.actor = actor
    this.animation = null
    this.idleMotion = data.idleMotion
    this.moveMotion = data.moveMotion
  }

  /**
   * 绑定角色动画
   * @param {Animation} [animation] 动画实例
   */
  bindAnimation(animation) {
    this.animation = animation
    const active = !!animation
    // 存在动画则激活，否则反激活
    if (this.active !== active) {
      this.active = active
      if (active) {
        // 激活状态：恢复默认方法
        delete this.update
        delete this.startIdle
        delete this.startMoving
        delete this.playMotion
      } else {
        // 非激活状态：禁用部分方法
        this.update = Function.empty
        this.startIdle = Function.empty
        this.startMoving = Function.empty
        this.playMotion = Function.empty
      }
    }
    if (active) {
      // 设置角色动画的初始动作
      animation.setMotion(this.getCurrentMotionName())
      animation.setAngle(this.actor.angle)
    }
  }

  /** 改变角色动作 */
  changeMotion(type, motionName) {
    switch (type) {
      case 'idle':
        this.idleMotion = motionName
        if (this.state === 'idle') {
          this.startIdle()
        }
        break
      case 'move':
        this.moveMotion = motionName
        if (this.state === 'move') {
          this.startMoving()
        }
        break
    }
  }

  /** 开始闲置动作 */
  startIdle() {
    this.state = 'idle'
    if (this.playing === false) {
      const {animation} = this
      if (animation.motionName === this.idleMotion) return
      if (animation.setMotion(this.idleMotion)) {
        animation.restart()
      }
    }
  }

  /** 开始移动动作 */
  startMoving() {
    this.state = 'move'
    if (this.playing === false) {
      const {animation} = this
      if (animation.motionName === this.moveMotion) return
      if (animation.setMotion(this.moveMotion)) {
        animation.restart()
      }
    }
  }

  /** 重新播放动作 */
  restart() {
    this.playing = false
    this.animation.speed = 1
    if (this.animation.setMotion(this.getCurrentMotionName())) {
      this.animation.restart()
    }
  }

  /** 获取当前动作名称 */
  getCurrentMotionName() {
    switch (this.state) {
      case 'idle': return this.idleMotion
      case 'move': return this.moveMotion
    }
  }

  /**
   * 播放角色动作(结束时恢复动作)
   * @param {string} motionName 动作名称
   * @param {number} speed 播放速度
   * @returns {Animation|undefined}
   */
  playMotion(motionName, speed = 1) {
    const {animation} = this
    // 播放新动作
    if (animation.setMotion(motionName)) {
      this.playing = true
      animation.speed = speed
      // 重新播放动画
      animation.restart()
      animation.onFinish(() => {
        // 播放结束后设置回闲置或移动动作
        this.restart()
      })
      // 返回动画对象
      return animation
    }
    return undefined
  }

  /** 停止播放角色动作 */
  stopMotion() {
    this.animation.finish()
  }

  /** 保存角色动作设定 */
  saveData() {
    return {
      idle: this.idleMotion,
      move: this.moveMotion,
    }
  }

  /**
   * 加载角色动作设定
   * @param {Object} motions 
   */
  loadData(motions) {
    this.idleMotion = motions.idle
    this.moveMotion = motions.move
  }
}

// ******************************** 角色碰撞器类 ********************************

class ActorCollider {
  /** 绑定的角色对象
   *  @type {Actor}
   */ actor

  /** 碰撞器的形状
   *  @type {string}
   */ shape

  /** 角色碰撞体积大小
   *  @type {number}
   */ size

  /** 角色碰撞体积半径
   *  @type {number}
   */ half

  /** 角色碰撞体重大小
   *  @type {number}
   */ weight

  /** 角色是否已经移动
   *  @type {boolean}
   */ moved

  /**
   * 角色碰撞器
   * @param {Actor} actor 绑定的角色对象
   */
  constructor(actor) {
    const {data} = actor
    this.actor = actor
    this.shape = data.shape
    this.size = data.size
    this.half = data.size / 2
    this.weight = data.weight
    this.moved = false
  }

  // 设置体重
  setWeight(weight) {
    this.weight = weight
    // 更新角色的障碍区域
    this.actor.parent?.scene.obstacles.update(this.actor)
  }

  // 更新上一次的位置
  updateLastPosition() {
    this.lastX = this.actor.x
    this.lastY = this.actor.y
  }

  // 角色碰撞系统开关
  static actorCollisionEnabled = true

  // 场景碰撞系统开关
  static sceneCollisionEnabled = true

  // 场景碰撞系统角色半径
  static sceneCollisionRadius = 0

  // 角色碰撞距离
  static actorCollisionDist = 0

  /** 初始化 */
  static initialize() {
    const {collision} = Data.config
    // 设置角色碰撞系统开关
    this.actorCollisionEnabled = collision.actor.enabled
    // 设置场景碰撞系统开关
    this.sceneCollisionEnabled = collision.scene.enabled
    // 设置场景碰撞角色体积的半径
    this.sceneCollisionRadius = collision.scene.actorSize / 2
    // 设置角色碰撞的最小距离
    this.actorCollisionDist = collision.scene.actorSize
  }

  /** 处理角色与场景之间的碰撞 */
  static handleSceneCollisions() {
    if (ActorCollider.sceneCollisionEnabled === false) return
    const scene = Scene.binding
    const radius = ActorCollider.sceneCollisionRadius
    const radiusSquared = radius ** 2
    const terrains = scene.terrainObstacles
    const width = scene.width
    const height = scene.height
    if (width * height === 0) return
    const right = width - 1
    const bottom = height - 1
    const actors = scene.actors
    const length = actors.length
    // 遍历场景角色，计算碰撞
    for (let i = 0; i < length; i++) {
      const actor = actors[i]
      const collider = actor.collider
      // 如果角色未移动，跳过
      if (collider.moved === false) {
        continue
      }
      // 如果角色在场景网格之外，跳过
      if (actor.x < radius) actor.x = radius
      if (actor.y < radius) actor.y = radius
      if (actor.x > width - radius) actor.x = width - radius
      if (actor.y > height - radius) actor.y = height - radius
      const passage = actor.passage
      if (passage === -1) continue
      const sx = Math.clamp(actor.intX, 0, right)
      const sy = Math.clamp(actor.intY, 0, bottom)
      let dx = Math.floor(actor.x)
      let dy = Math.floor(actor.y)
      // 如果角色锚点穿过了水平网格
      if (sx !== dx) {
        const unitY = (dy - sy) / (dx - sx)
        const step = sx < dx ? 1 : -1
        let x = sx
        do {
          x += step
          const y = Math.floor(sy + (x - sx) * unitY)
          if (terrains[x + y * width] !== passage) {
            actor.x = sx < dx ? x - radius : x + 1 + radius
            dx = Math.floor(actor.x)
            break
          }
        }
        while (x !== dx)
      }
      // 如果角色锚点穿过了垂直网格
      if (sy !== dy) {
        const unitX = (dx - sx) / (dy - sy)
        const step = sy < dy ? 1 : -1
        let y = sy
        do {
          y += step
          const x = Math.floor(sx + (y - sy) * unitX)
          if (terrains[x + y * width] !== passage) {
            actor.y = sy < dy ? y - radius : y + 1 + radius
            dy = Math.floor(actor.y)
            break
          }
        }
        while (y !== dy)
      }
      const ax = actor.x
      const ay = actor.y
      const al = Math.floor(ax - radius)
      const at = Math.floor(ay - radius)
      const ar = Math.ceil(ax + radius)
      const ab = Math.ceil(ay + radius)
      const x = Math.round(ax)
      const y = Math.round(ay)
      let ox = 0
      let oy = 0
      // 如果角色跨越了水平网格
      if (al + 1 !== ar) {
        if (x === dx) {
          // 如果角色锚点在网格中靠左的位置
          if (terrains[al + dy * width] !== passage) {
            // 如果左边是不能通行的区域，让角色贴墙
            actor.x = x + radius
          } else {
            ox = -1
          }
        } else {
          // 如果角色锚点在网格中靠右的位置
          if (terrains[x + dy * width] !== passage) {
            // 如果右边是不能通行的区域，让角色贴墙
            actor.x = x - radius
          } else {
            ox = 1
          }
        }
      }
      // 如果角色跨越了垂直网格
      if (at + 1 !== ab) {
        if (y === dy) {
          // 如果角色锚点在网格中靠上的位置
          if (terrains[dx + at * width] !== passage) {
            // 如果上边是不能通行的区域，让角色贴墙
            actor.y = y + radius
          } else {
            oy = -1
          }
        } else {
          // 如果角色锚点在网格中靠下的位置
          if (terrains[dx + y * width] !== passage) {
            // 如果下边是不能通行的区域，让角色贴墙
            actor.y = y - radius
          } else {
            oy = 1
          }
        }
      }
      // 如果角色跨越了场景网格，但是未发生碰撞
      // 则判断地形的一角是否与角色发生碰撞
      if (ox !== 0 && oy !== 0 &&
        terrains[dx + ox + (dy + oy) * width] !== passage) {
        // 如果离角色最近的网格角不可通行，且距离小于碰撞半径，则判定为碰撞
        const distSquared = (x - ax) ** 2 + (y - ay) ** 2
        if (distSquared >= radiusSquared) continue
        // 计算最小移动向量，把角色推离到碰撞边缘
        const hypot = radius - Math.sqrt(distSquared)
        const angle = Math.atan2(ay - y, ax - x)
        actor.x += hypot * Math.cos(angle)
        actor.y += hypot * Math.sin(angle)
      }
    }
  }

  /** 处理角色与角色之间的碰撞 */
  static handleActorCollisions() {
    if (ActorCollider.actorCollisionEnabled === false) return
    const {cells} = Scene.actors
    const {width, height, length} = cells

    // 计算同一个区间的角色碰撞
    for (let i = 0; i < length; i++) {
      const cell = cells[i]
      const length = cell.length
      for (let si = 0; si < length; si++) {
        const sActor = cell[si]
        if (sActor.collider.weight === 0) continue
        for (let di = si + 1; di < length; di++) {
          ActorCollider.handleCollisionBetweenTwoActors(sActor, cell[di])
        }
      }
    }

    // 计算左右区间的角色碰撞
    const ex = width - 1
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < ex; x++) {
        const i = x + y * width
        ActorCollider.handleCollisionsBetweenTwoCells(cells[i], cells[i + 1])
      }
    }

    // 计算上下区间的角色碰撞
    const ey = height - 1
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < ey; y++) {
        const i = x + y * width
        ActorCollider.handleCollisionsBetweenTwoCells(cells[i], cells[i + width])
      }
    }

    // 计算左上到右下区间的角色碰撞
    const lowerRight = width + 1
    for (let i = 0; i < ex; i++) {
      const end = Math.min(ex - i, ey)
      for (let x = i, y = 0; y < end; x++, y++) {
        const i = x + y * width
        ActorCollider.handleCollisionsBetweenTwoCells(cells[i], cells[i + lowerRight])
      }
    }
    for (let i = 1; i < ey; i++) {
      const end = Math.min(ex, ey - i)
      for (let x = 0, y = i; x < end; x++, y++) {
        const i = x + y * width
        ActorCollider.handleCollisionsBetweenTwoCells(cells[i], cells[i + lowerRight])
      }
    }

    // 计算右上到左下区间的角色碰撞
    const lowerLeft = width - 1
    for (let i = ex; i > 0; i--) {
      const end = Math.min(i, ey)
      for (let x = i, y = 0; y < end; x--, y++) {
        const i = x + y * width
        ActorCollider.handleCollisionsBetweenTwoCells(cells[i], cells[i + lowerLeft])
      }
    }
    for (let i = 1; i < ey; i++) {
      const end = Math.min(ex + i, ey)
      for (let x = ex, y = i; y < end; x--, y++) {
        const i = x + y * width
        ActorCollider.handleCollisionsBetweenTwoCells(cells[i], cells[i + lowerLeft])
      }
    }
  }

  /** 处理两个角色之间的碰撞 */
  static handleCollisionBetweenTwoActors = (IIFE => {
    // 添加容差值避免陷入无限碰撞
    const TOLERANCE = 0.01

    // 触发角色碰撞事件
    const collide = (sActor, dActor) => {
      const commands = sActor.events.collision
      if (commands) {
        const event = new EventHandler(commands)
        event.triggerActor = sActor
        event.targetActor = dActor
        EventHandler.call(event, sActor.updaters)
      }
      sActor.script.emit('collision', dActor)
    }

    // 碰撞 - 正方形和正方形
    const collideSquareAndSquare = (sCollider, dCollider) => {
      const sActor = sCollider.actor
      const dActor = dCollider.actor
      const distMin = sCollider.half + dCollider.half
      const distX = Math.abs(sActor.x - dActor.x)
      const distY = Math.abs(sActor.y - dActor.y)
      // 如果角色之间的水平和垂直距离小于最小距离，则发生碰撞
      if (distX < distMin && distY < distMin) {
        const sWeight = sCollider.weight
        const dWeight = dCollider.weight
        // 体重比值0.5~2映射为0~1的推力
        const ratio = Math.clamp(dWeight * 3 / (sWeight + dWeight) - 1, 0, 1)
        if (distX > distY) {
          // 如果水平距离大于垂直距离，把两个角色从水平方向上分开
          const offset = distMin - distX + TOLERANCE
          const sOffset = offset * ratio
          const dOffset = offset - sOffset
          // 根据角色左右位置情况进行计算
          if (sActor.x < dActor.x) {
            sActor.x -= sOffset
            dActor.x += dOffset
          } else {
            sActor.x += sOffset
            dActor.x -= dOffset
          }
        } else {
          // 如果垂直距离大于水平距离，把两个角色从垂直方向上分开
          const offset = distMin - distY + TOLERANCE
          const sOffset = offset * ratio
          const dOffset = offset - sOffset
          // 根据角色上下位置情况进行计算
          if (sActor.y < dActor.y) {
            sActor.y -= sOffset
            dActor.y += dOffset
          } else {
            sActor.y += sOffset
            dActor.y -= dOffset
          }
        }
        // 设置角色为已移动状态
        sCollider.moved = true
        dCollider.moved = true
        // 发送角色碰撞事件
        collide(sActor, dActor)
        collide(dActor, sActor)
      }
    }

    // 碰撞 - 圆形和圆形
    const collideCircleAndCircle = (sCollider, dCollider) => {
      const sActor = sCollider.actor
      const dActor = dCollider.actor
      const distMin = sCollider.half + dCollider.half
      const distX = dActor.x - sActor.x
      const distY = dActor.y - sActor.y
      const distSquared = distX ** 2 + distY ** 2
      // 如果角色之间的水平和垂直距离小于最小距离，则发生碰撞
      if (distSquared < distMin ** 2) {
        const dist = Math.sqrt(distSquared)
        const offset = distMin - dist
        const offsetX = offset / distMin * distX
        const offsetY = offset / distMin * distY
        const sWeight = sCollider.weight
        const dWeight = dCollider.weight
        // 体重比值0.5~2映射为0~1的推力
        const ratio = Math.clamp(dWeight * 3 / (sWeight + dWeight) - 1, 0, 1)
        if (offsetX !== 0) {
          // 如果水平距离大于垂直距离，把两个角色从水平方向上分开
          const tOffsetX = offsetX + (offsetX > 0 ? TOLERANCE : -TOLERANCE)
          const sOffset = tOffsetX * ratio
          const dOffset = tOffsetX - sOffset
          // 根据角色左右位置情况进行计算
          sActor.x -= sOffset
          dActor.x += dOffset
        }
        if (offsetY !== 0) {
          // 如果垂直距离大于水平距离，把两个角色从垂直方向上分开
          const tOffsetY = offsetY + (offsetY > 0 ? TOLERANCE : -TOLERANCE)
          const sOffset = tOffsetY * ratio
          const dOffset = tOffsetY - sOffset
          // 根据角色上下位置情况进行计算
          sActor.y -= sOffset
          dActor.y += dOffset
        }
        // 设置角色为已移动状态
        sCollider.moved = true
        dCollider.moved = true
        // 发送角色碰撞事件
        collide(sActor, dActor)
        collide(dActor, sActor)
      }
    }

    // 碰撞 - 正方形和圆形
    const collideSquareAndCircle = (sCollider, dCollider) => {
      const sActor = sCollider.actor
      const dActor = dCollider.actor
      const distMin = dCollider.half
      const sx = sActor.x
      const sy = sActor.y
      const dx = dActor.x
      const dy = dActor.y
      const sl = sx - sCollider.half
      const sr = sx + sCollider.half
      const st = sy - sCollider.half
      const sb = sy + sCollider.half
      const distX = dx - (dx < sl ? sl : dx > sr ? sr : dx)
      const distY = dy - (dy < st ? st : dy > sb ? sb : dy)
      const distSquared = distX ** 2 + distY ** 2
      // 如果角色之间的水平和垂直距离小于最小距离，则发生碰撞
      if (distSquared < distMin ** 2) {
        const dist = Math.sqrt(distSquared)
        const offset = distMin - dist
        let offsetX
        let offsetY
        if (distX !== 0 && distY !== 0) {
          offsetX = offset / distMin * distX
          offsetY = offset / distMin * distY
        } else {
          const rx = dx - sx
          const ry = dy - sy
          if (Math.abs(rx) > Math.abs(ry)) {
            offsetX = offset * Math.sign(rx)
            offsetY = 0
          } else {
            offsetX = 0
            offsetY = offset * Math.sign(ry)
          }
        }
        const sWeight = sCollider.weight
        const dWeight = dCollider.weight
        // 体重比值0.5~2映射为0~1的推力
        const ratio = Math.clamp(dWeight * 3 / (sWeight + dWeight) - 1, 0, 1)
        if (offsetX !== 0) {
          // 如果水平距离大于垂直距离，把两个角色从水平方向上分开
          const tOffsetX = offsetX + (offsetX > 0 ? TOLERANCE : -TOLERANCE)
          const sOffset = tOffsetX * ratio
          const dOffset = tOffsetX - sOffset
          // 根据角色左右位置情况进行计算
          sActor.x -= sOffset
          dActor.x += dOffset
        }
        if (offsetY !== 0) {
          // 如果垂直距离大于水平距离，把两个角色从垂直方向上分开
          const tOffsetY = offsetY + (offsetY > 0 ? TOLERANCE : -TOLERANCE)
          const sOffset = tOffsetY * ratio
          const dOffset = tOffsetY - sOffset
          // 根据角色上下位置情况进行计算
          sActor.y -= sOffset
          dActor.y += dOffset
        }
        // 设置角色为已移动状态
        sCollider.moved = true
        dCollider.moved = true
        // 发送角色碰撞事件
        collide(sActor, dActor)
        collide(dActor, sActor)
      }
    }

    return (sActor, dActor) => {
      const dCollider = dActor.collider
      // 如果角色体重为0，不参与碰撞
      if (dCollider.weight === 0) return
      // 如果角色队伍之间不可碰撞
      const code = sActor.teamIndex | dActor.teamIndex << 8
      if (Team.collisionMap[code] === 0) return
      const sCollider = sActor.collider
      switch (sCollider.shape) {
        case 'circle':
          switch (dCollider.shape) {
            case 'circle':
              return collideCircleAndCircle(sCollider, dCollider)
            case 'square':
              return collideSquareAndCircle(dCollider, sCollider)
          }
        case 'square':
          switch (dCollider.shape) {
            case 'circle':
              return collideSquareAndCircle(sCollider, dCollider)
            case 'square':
              return collideSquareAndSquare(sCollider, dCollider)
          }
      }
    }
  })()

  /**
   * 处理两个分区之间的角色碰撞
   * @param {Actor[]} sCell 场景角色分区1
   * @param {Actor[]} dCell 场景角色分区2
   */
  static handleCollisionsBetweenTwoCells = (sCell, dCell) => {
    const sLength = sCell.length
    const dLength = dCell.length
    for (let si = 0; si < sLength; si++) {
      const sActor = sCell[si]
      // 如果角色的体重为0，跳过
      if (sActor.collider.weight === 0) continue
      for (let di = 0; di < dLength; di++) {
        ActorCollider.handleCollisionBetweenTwoActors(sActor, dCell[di])
      }
    }
  }
}

// ******************************** 角色导航器类 ********************************

class ActorNavigator {
  /** 角色导航模式
   *  @type {string}
   */ mode

  /** 绑定的角色对象
   *  @type {Actor}
   */ actor

  /** 跟随的目标角色
   *  @type {Actor|null}
   */ target

  /** 角色移动角度
   *  @type {number}
   */ movementAngle

  /** 角色移动速度
   *  @type {number}
   */ movementSpeed

  /** 角色移动速度系数
   *  @type {number}
   */ movementFactor

  /** 角色移动速度系数(临时)
   *  @type {number}
   */ movementFactorTemp

  /** 角色移动路径
   *  @type {Float64Array|null}
   */ movementPath

  /** 角色移动速度X
   *  @type {number}
   */ velocityX

  /** 角色移动速度Y
   *  @type {number}
   */ velocityY

  /** 角色移动结束后回调函数
   *  @type {Array<Function>|null}
   */ callbacks

  /** 角色移动超时时间(毫秒)
   *  @type {number}
   */ timeout

  /** 角色上一次的场景位置X
   *  @type {number}
   */ lastX

  /** 角色上一次的场景位置Y
   *  @type {number}
   */ lastY

  /** 角色跟随目标时的最小距离
   *  @type {number}
   */ minDist

  /** 角色跟随目标时的最大距离
   *  @type {number}
   */ maxDist

  /** 角色跟随目标时的最大垂直距离
   *  @type {number}
   */ vertDist

  /** 计算路径的时候是否绕过角色
   *  @type {boolean}
   */ bypass

  /** 角色圆形跟随模式的偏移值(-0.8~+0.8)
   *  @type {number}
   */ followingOffset

  /** 角色在跟随目标时是否进行寻路
   *  @type {boolean}
   */ followingNavigate

  /** 角色跟随目标一次之后停止移动
   *  @type {boolean}
   */ followOnce

  /** 角色跟随目标时切换动作的缓冲时间
   *  @type {number}
   */ animBufferTime

  /** 导航器的更新函数(状态机模式)
   *  @type {Function}
   */ update

  /**
   * 角色导航器
   * @param {Actor} actor 绑定的角色对象
   */
  constructor(actor) {
    this.mode = 'stop'
    this.actor = actor
    this.target = null
    this.movementAngle = 0
    this.movementSpeed = actor.data.speed
    this.velocityX = 0
    this.velocityY = 0
    this.movementFactor = 1
    this.movementFactorTemp = 1
    this.movementPath = null
    this.callbacks = null
    this.timeout = 0
    this.lastX = 0
    this.lastY = 0
    this.update = Function.empty
  }

  /**
   * 设置角色的移动速度
   * @param {number} speed 移动速度(图块/秒)
   */
  setMovementSpeed(speed) {
    this.movementSpeed = speed
    this.calculateVelocity(this.movementAngle)
  }

  /**
   * 设置角色的移动速度系数
   * @param {number} factor 移动速度系数
   */
  setMovementFactor(factor) {
    this.movementFactor = factor
    this.calculateVelocity(this.movementAngle)
  }

  /**
   * 设置角色的移动速度系数(临时)
   * @param {number} factor 移动速度系数(不保存)
   */
  setMovementFactorTemp(factor) {
    this.movementFactorTemp = factor
    this.calculateVelocity(this.movementAngle)
  }

  /**
   * 计算角色的移动速度分量
   * @param {number} angle 移动速度的角度(弧度)
   */
  calculateVelocity(angle) {
    const speed = this.movementSpeed
    * this.movementFactor
    * this.movementFactorTemp
    this.movementAngle = angle
    this.velocityX = speed * Math.cos(angle) / 1000
    this.velocityY = speed * Math.sin(angle) / 1000
  }

  /** 角色停止移动 */
  stopMoving() {
    if (this.mode !== 'stop') {
      this.mode = 'stop'
      this.target = null
      this.movementPath = null
      this.actor.animationController.startIdle()
      // 设置更新函数为：空函数
      this.update = Function.empty
      // 执行结束回调(如果有)
      if (this.callbacks !== null) {
        for (const callback of this.callbacks) {
          callback()
        }
        this.callbacks = null
      }
    }
  }

  /**
   * 设置移动结束回调函数
   * @param {function} callback 在角色停止当前的移动行为后触发
   */
  onFinish(callback) {
    if (this.mode === 'stop') {
      return callback()
    }
    if (this.callbacks !== null) {
      this.callbacks.push(callback)
    } else {
      this.callbacks = [callback]
    }
  }

  /**
   * 角色向指定角度持续移动
   * @param {number} angle 移动角度(弧度)
   */
  moveTowardAngle(angle) {
    if (this.mode !== 'keep') {
      this.stopMoving()
      this.mode = 'keep'
      this.actor.animationController.startMoving()
    }
    this.calculateVelocity(angle)
    // 设置更新函数为：向前移动
    this.update = this.updateForwardMovement
  }

  /**
   * 角色移动到指定位置
   * @param {number} x 场景图块X
   * @param {number} y 场景图块Y
   */
  moveTo(x, y) {
    this.route(ScenePathFinder.createUnitPath(x, y))
  }

  /**
   * 角色导航到指定位置
   * @param {number} x 场景图块X
   * @param {number} y 场景图块Y
   * @param {boolean} [bypass] 是否绕过角色
   */
  navigateTo(x, y, bypass = false) {
    this.bypass = bypass
    this.route(ScenePathFinder.createPath(this.actor.x, this.actor.y, x, y, this.actor.passage, bypass), true)
  }

  /**
   * 角色设置移动路线
   * @param {Float64Array} path 移动路线，长度是2的整数倍
   * @param {boolean} [navigate] 是否开启导航
   */
  route(path, navigate = false) {
    if (this.mode !== 'navigate') {
      this.stopMoving()
      this.mode = 'navigate'
      this.actor.animationController.startMoving()
    }
    this.timeout = navigate ? 500 : -1
    this.movementPath = path
    // 设置更新函数为：路径移动
    this.update = this.updatePathMovement
  }

  /**
   * 跟随目标角色(圆形模式)
   * @param {Actor} target 目标角色
   * @param {number} minDist 保持最小距离
   * @param {number} maxDist 保持最大距离
   * @param {number} [offset = 0] 跟随位置偏移[-0.8 ~ +0.8]
   * @param {boolean} [navigate = false] 是否开启自动寻路
   * @param {boolean} [bypass = false] 自动寻路是否绕过角色
   * @param {boolean} [once = false] 跟随一次(到达位置后停止移动)
   */
  followCircle(target, minDist, maxDist, offset = 0, navigate = false, bypass = false, once = false) {
    if (this.mode !== 'follow') {
      this.stopMoving()
      this.mode = 'follow'
    } else {
      this.movementPath = null
    }
    this.target = target
    // 设置最小和最大距离(至少是最小距离 + 0.1)
    this.minDist = minDist
    this.maxDist = Math.max(maxDist, minDist + 0.1)
    this.followingOffset = offset
    this.followingNavigate = navigate
    this.bypass = bypass
    this.followOnce = once
    this.followTarget = once
    ? this._circleFollowTargetOnce
    : this._circleFollowTarget
    // 设置更新函数为：跟随角色
    this.update = this.followTarget
  }

  /**
   * // 跟随目标角色(矩形模式)
   * @param {Actor} target 目标角色
   * @param {number} minDist 保持最小水平距离
   * @param {number} maxDist 保持最大水平距离
   * @param {number} [vertDist = 0] 保持最大垂直距离
   * @param {boolean} [navigate = false] 是否开启自动寻路
   * @param {boolean} [bypass = false] 自动寻路是否绕过角色
   * @param {boolean} [once = false] 跟随一次(到达位置后停止移动)
   */
  followRectangle(target, minDist, maxDist, vertDist = 0, navigate = false, bypass = false, once = false) {
    if (this.mode !== 'follow') {
      this.stopMoving()
      this.mode = 'follow'
    } else {
      this.movementPath = null
    }
    this.target = target
    // 设置最小和最大距离(至少是最小距离 + 0.1)
    this.minDist = minDist
    this.maxDist = Math.max(maxDist, minDist + 0.1)
    this.vertDist = vertDist
    this.followingNavigate = navigate
    this.bypass = bypass
    this.followOnce = once
    this.followTarget = once
    ? this._rectangleFollowTargetOnce
    : this._rectangleFollowTarget
    // 设置更新函数为：跟随角色
    this.update = this.followTarget
  }

  /**
   * 更新角色向前移动
   * @param {number} deltaTime 增量时间(毫秒)
   */
  updateForwardMovement(deltaTime) {
    const actor = this.actor
    const x = this.velocityX * deltaTime
    const y = this.velocityY * deltaTime
    actor.updateAngle(this.movementAngle)
    actor.move(x, y)
  }

  /**
   * 更新角色路径移动
   * @param {number} deltaTime 增量时间(毫秒)
   */
  updatePathMovement(deltaTime) {
    // 逐帧计算角度，并计算移动速度分量
    const actor = this.actor
    const path = this.movementPath
    if (this.timeout !== -1 && (this.timeout -= deltaTime) <= 0) {
      const destX = path[path.length - 2]
      const destY = path[path.length - 1]
      return this.navigateTo(destX, destY, this.bypass)
    }
    const pi = path.index
    const dx = path[pi]
    const dy = path[pi + 1]
    const distX = dx - actor.x
    const distY = dy - actor.y
    const angle = Math.atan2(distY, distX)
    actor.updateAngle(angle)
    this.calculateVelocity(angle)

    // 计算当前帧向前移动的距离
    const mx = this.velocityX * deltaTime
    const my = this.velocityY * deltaTime
    if (Math.abs(distX) <= Math.abs(mx) + 0.0001 &&
    Math.abs(distY) <= Math.abs(my) + 0.0001) {
      // 如果目标点在当前帧移动范围内，则将角色位置设为目标点
      // 并且将路径索引指向下一个路线节点
      actor.setPosition(dx, dy)
      path.index += 2
      // 如果已经是终点，则停止移动
      if (path.index === path.length) {
        this.stopMoving()
      }
    } else {
      // 将角色的位置加上当前帧移动距离
      actor.move(mx, my)
    }
  }

  /**
   * 切换到跟随缓冲模式，如果是跟随一次则停止移动
   */
  _switchToFollowTargetBuffer() {
    if (this.followOnce) {
      this.stopMoving()
    } else {
      this.update = this._followTargetBuffer
      this.animBufferTime = 100
    }
  }

  /**
   * 跟随目标角色时用来切换状态的缓冲函数
   * @param {number} deltaTime 增量时间(毫秒)
   */
  _followTargetBuffer(deltaTime) {
    // 缓冲时间结束后切换动画为idle动作
    // 避免跟随者移动速度>=目标时频繁地切换动作
    if ((this.animBufferTime -= deltaTime) <= 0) {
      this.actor.animationController.startIdle()
      // 设置更新函数为：跟随角色
      this.update = this.followTarget
      return this.update(deltaTime)
    }
    // 缓冲未结束，调用跟随角色函数
    this.followTarget(deltaTime)
  }

  /**
   * 圆形模式 - 跟随目标角色
   * @param {number} deltaTime 增量时间(毫秒)
   */
  _circleFollowTarget(deltaTime) {
    const actor = this.actor
    const target = this.target
    // 如果目标已销毁，停止跟随
    if (target.destroyed) {
      return this.stopMoving()
    }
    const dist = Math.sqrt(
      (actor.x - target.x) ** 2
    + (actor.y - target.y) ** 2
    )
    // 如果角色距离大于最大距离，开始跟随
    // 设置更新函数为：接近目标(圆形模式)
    if (dist > this.maxDist) {
      actor.animationController.startMoving()
      this.update = this.followingNavigate
      ? this._circleNavigateToTarget
      : this._circleApproachTarget
      return this.update(deltaTime)
    }
    // 如果角色距离小于最小距离，开始跟随
    // 设置更新函数为：远离目标(圆形模式)
    if (dist < this.minDist) {
      actor.animationController.startMoving()
      this.update = this._circleLeaveTarget
      return this.update(deltaTime)
    }
  }

  /**
   * 圆形模式 - 跟随目标角色(一次)
   * @param {number} deltaTime 增量时间(毫秒)
   */
  _circleFollowTargetOnce(deltaTime) {
    this._circleFollowTarget(deltaTime)
    // 如果当前跟随方法就是更新函数，表示跟随已经结束
    if (this._circleFollowTargetOnce === this.update) {
      this.stopMoving()
    }
  }

  /**
   * 圆形模式 - 接近目标角色
   * @param {number} deltaTime 增量时间(毫秒)
   */
  _circleApproachTarget(deltaTime) {
    const actor = this.actor
    const target = this.target
    // 如果目标已销毁，停止跟随
    if (target.destroyed) {
      return this.stopMoving()
    }
    let distX = target.x - actor.x
    let distY = target.y - actor.y
    // 如果角色距离小于等于最大距离，进入跟随缓冲模式(100ms)
    if (Math.sqrt(distX ** 2 + distY ** 2) <= this.maxDist) {
      return this._switchToFollowTargetBuffer()
    }
    let angle = Math.atan2(distY, distX)
    const offset = this.followingOffset
    if (offset !== 0 && this.maxDist > 0) {
      // 计算跟随偏移距离和偏移角度
      const offsetDist = Math.abs(this.maxDist * offset)
      angle += offset > 0 ? Math.PI / 2 : -Math.PI / 2
      // 加上偏移分量，计算朝向偏移目标点的角度
      distX += offsetDist * Math.cos(angle)
      distY += offsetDist * Math.sin(angle)
      angle = Math.atan2(distY, distX)
    }
    // 向接近目标的方向移动
    this.calculateVelocity(angle)
    this.updateForwardMovement(deltaTime)
  }

  /**
   * 圆形模式 - 导航到目标角色
   * @param {number} deltaTime 增量时间(毫秒)
   */
  _circleNavigateToTarget(deltaTime) {
    const actor = this.actor
    const target = this.target
    // 如果目标已销毁，停止跟随
    if (target.destroyed) {
      return this.stopMoving()
    }
    const sx = actor.x
    const sy = actor.y
    const distX = target.x - sx
    const distY = target.y - sy
    // 如果角色距离小于等于最大距离，进入跟随缓冲模式(100ms)
    if (Math.sqrt(distX ** 2 + distY ** 2) <= this.maxDist) {
      this.movementPath = null
      this._switchToFollowTargetBuffer()
      return
    }
    // 每隔一段时间计算移动路径
    if (!this.movementPath || (this.timeout -= deltaTime) <= 0) {
      let {x, y} = target
      const offset = this.followingOffset
      if (offset !== 0 && this.maxDist > 0) {
        // 计算跟随偏移距离和偏移角度
        const offsetDist = Math.abs(this.maxDist * offset)
        const offsetAngle = offset > 0 ? Math.PI / 2 : -Math.PI / 2
        const angle = Math.atan2(distY, distX) + offsetAngle
        x += offsetDist * Math.cos(angle)
        y += offsetDist * Math.sin(angle)
      }
      this.movementPath = ScenePathFinder.createPath(sx, sy, x, y, actor.passage, this.bypass)
      this.timeout = 500
    }
    // 逐帧计算角度，并计算移动速度分量
    const path = this.movementPath
    const pi = path.index
    const dx = path[pi]
    const dy = path[pi + 1]
    const pDistX = dx - sx
    const pDistY = dy - sy
    const angle = Math.atan2(pDistY, pDistX)
    actor.updateAngle(angle)
    this.calculateVelocity(angle)

    // 计算当前帧向前移动的距离
    const mx = this.velocityX * deltaTime
    const my = this.velocityY * deltaTime
    if (Math.abs(pDistX) <= Math.abs(mx) + 0.0001 &&
      Math.abs(pDistY) <= Math.abs(my) + 0.0001) {
      actor.setPosition(dx, dy)
      path.index += 2
      if (path.index === path.length) {
        this.movementPath = null
      }
    } else {
      actor.move(mx, my)
    }
  }

  /**
   * 圆形模式 - 远离目标角色
   * @param {number} deltaTime 增量时间(毫秒)
   */
  _circleLeaveTarget(deltaTime) {
    const actor = this.actor
    const target = this.target
    // 如果目标已销毁，停止跟随
    if (target.destroyed) {
      return this.stopMoving()
    }
    const distX = actor.x - target.x
    const distY = actor.y - target.y
    // 如果角色距离大于等于最小距离，进入跟随缓冲模式(100ms)
    if (Math.sqrt(distX ** 2 + distY ** 2) >= this.minDist) {
      return this._switchToFollowTargetBuffer()
    }
    // 向远离目标的方向移动
    const angle = Math.atan2(distY, distX)
    this.calculateVelocity(angle)
    this.updateForwardMovement(deltaTime)
  }

  /**
   * 矩形模式 - 跟随目标角色
   * @param {number} deltaTime 增量时间(毫秒)
   */
  _rectangleFollowTarget(deltaTime) {
    const actor = this.actor
    const target = this.target
    // 如果目标已销毁，停止跟随
    if (target.destroyed) {
      return this.stopMoving()
    }
    const distX = Math.abs(actor.x - target.x)
    const distY = Math.abs(actor.y - target.y)
    // 如果角色水平距离大于最大距离或小于最小距离
    // 或者角色垂直距离大于垂直距离(+0.0001容差)
    // 设置更新函数为：接近目标(矩形模式)
    if (distX > this.maxDist ||
      distX < this.minDist ||
      distY > this.vertDist + 0.0001) {
      actor.animationController.startMoving()
      this.update = this.followingNavigate
      ? this._rectangleNavigateToTarget
      : this._rectangleApproachTarget
      return this.update(deltaTime)
    }
  }

  /**
   * 矩形模式 - 跟随目标角色(一次)
   * @param {number} deltaTime 增量时间(毫秒)
   */
  _rectangleFollowTargetOnce(deltaTime) {
    this._rectangleFollowTarget(deltaTime)
    // 如果当前跟随方法就是更新函数，表示跟随已经结束
    if (this._rectangleFollowTargetOnce === this.update) {
      this.stopMoving()
    }
  }

  /**
   * 矩形模式 - 接近目标角色
   * @param {number} deltaTime 增量时间(毫秒)
   */
  _rectangleApproachTarget(deltaTime) {
    const actor = this.actor
    const target = this.target
    // 如果目标已销毁，停止跟随
    if (target.destroyed) {
      return this.stopMoving()
    }
    const sx = actor.x
    const sy = actor.y
    const tx = target.x
    const ty = target.y
    const dx = sx < tx
    // 根据宿主角色在目标角色左侧或右侧的情况来计算终点水平坐标
    ? Math.clamp(sx, tx - this.maxDist, tx - this.minDist)
    : Math.clamp(sx, tx + this.minDist, tx + this.maxDist)
    // 计算终点垂直坐标
    const dy = Math.clamp(sy, ty - this.vertDist, ty + this.vertDist)
    const distX = dx - sx
    const distY = dy - sy
    const angle = Math.atan2(distY, distX)
    // 设置角度并计算移动速度分量
    actor.updateAngle(angle)
    this.calculateVelocity(angle)

    // 计算当前帧向前移动的距离并更新角色位置
    const mx = this.velocityX * deltaTime
    const my = this.velocityY * deltaTime
    actor.move(mx, my)
    const absDistX = Math.abs(actor.x - tx)
    if (absDistX >= this.minDist &&
      absDistX <= this.maxDist &&
      Math.abs(distY) <= Math.abs(my) + 0.0001) {
      // 角色进入最小和最大距离的范围
      // 并且垂直移动距离超过了角色垂直距离
      // 则将角色垂直位置设为目标点垂直位置
      actor.setPosition(actor.x, dy)
      // 进入跟随缓冲模式
      this._switchToFollowTargetBuffer()
    }
  }

  /**
   * 矩形模式 - 导航到目标角色
   * @param {number} deltaTime 增量时间(毫秒)
   */
  _rectangleNavigateToTarget(deltaTime) {
    const actor = this.actor
    const target = this.target
    // 如果目标已销毁，停止跟随
    if (target.destroyed) {
      return this.stopMoving()
    }
    const sx = actor.x
    const sy = actor.y
    const tx = target.x
    const ty = target.y
    const dx = sx < tx
    // 根据宿主角色在目标角色左侧或右侧的情况来计算终点水平坐标
    ? Math.clamp(sx, tx - this.maxDist, tx - this.minDist)
    : Math.clamp(sx, tx + this.minDist, tx + this.maxDist)
    // 计算终点垂直坐标
    const dy = Math.clamp(sy, ty - this.vertDist, ty + this.vertDist)
    // 每隔一段时间计算移动路径
    if (!this.movementPath || (this.timeout -= deltaTime) <= 0) {
      this.movementPath = ScenePathFinder.createPath(sx, sy, dx, dy, actor.passage, this.bypass)
      this.timeout = 500
    }
    // 逐帧计算角度，并计算移动速度分量
    const path = this.movementPath
    const pi = path.index
    const px = path[pi]
    const py = path[pi + 1]
    const pDistX = px - sx
    const pDistY = py - sy
    if (pDistX === 0 && pDistY === 0) {
      this.velocityX = 0
      this.velocityY = 0
    } else {
      const angle = Math.atan2(pDistY, pDistX)
      actor.updateAngle(angle)
      this.calculateVelocity(angle)
    }

    // 计算当前帧向前移动的距离
    const mx = this.velocityX * deltaTime
    const my = this.velocityY * deltaTime
    // 由于计算移动速度现在已经是精确值
    // 这里的容差值0.0001有可能不需要了
    if (Math.abs(pDistX) <= Math.abs(mx) + 0.0001 &&
      Math.abs(pDistY) <= Math.abs(my) + 0.0001) {
      actor.setPosition(px, py)
      path.index += 2
      if (path.index === path.length) {
        this.movementPath = null
        const absDistX = Math.abs(actor.x - tx)
        const absDistY = Math.abs(actor.y - dy)
        if (absDistX >= this.minDist &&
          absDistX <= this.maxDist &&
          absDistY <= Math.abs(my) + 0.0001) {
          // 角色进入最小和最大距离的范围
          // 并且垂直移动距离超过了角色垂直距离
          // 则将角色垂直位置设为目标点垂直位置
          actor.setPosition(actor.x, dy)
          // 进入跟随缓冲模式
          this._switchToFollowTargetBuffer()
        }
      }
    } else {
      actor.move(mx, my)
    }
  }
}