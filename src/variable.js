'use strict'

// ******************************** 独立变量 ********************************

const SelfVariable = new class {
  /** 独立变量映射表 */
  map = {}

  /** 重置变量值 */
  reset() {
    this.map = {}
  }

  /**
   * 获取变量值
   * @param {string} key 变量ID
   * @returns {any}
   */
  get(key) {
    return SelfVariable.map[key]
  }

  /**
   * 设置变量值
   * @param {string} key 变量ID
   * @param {any} value 变量值
   */
  set(key, value) {
    switch (typeof SelfVariable.map[key]) {
      case typeof value:
      case 'undefined':
        SelfVariable.map[key] = value
        break
    }
  }

  /** 保存独立变量数据 */
  saveData() {
    return this.map
  }

  /**
   * 加载独立变量数据(无法删除旧存档中的无效数据)
   * @param {Object} variables 保存的独立变量数据
   */
  loadData(variables) {
    this.map = variables
  }
}

// ******************************** 全局变量 ********************************

const Variable = new class {
  /** 全局变量分组(0:正常 1:共享 2:临时) */
  groups = [[], [], []]

  // 全局变量映射表
  map = {}

  /** 初始化全局变量 */
  initialize() {
    this.unpack(Data.variables)
    delete Data.variables
    // 设置临时变量的对象默认值
    for (const item of Variable.groups[2]) {
      if (item.value === null) {
        item.value = undefined
      }
    }
    // 重置变量数据
    this.reset([0, 1, 2])

    // 加载共享变量
    this.loadData(1, Data.globalData.variables)
  }

  /**
   * 解包变量数据
   * @param {Object[]} items 变量数据列表
   */
  unpack(items) {
    const groups = Variable.groups
    for (const item of items) {
      if (item.children) {
        // 解包文件夹中的变量
        this.unpack(item.children)
      } else {
        // 按分类存放变量对象
        groups[item.sort].push(item)
      }
    }
  }

  /** 重置变量值 */
  reset(groupIndices = [0, 2]) {
    for (const i of groupIndices) {
      for (const item of Variable.groups[i]) {
        // 以ID为键，写入变量值
        Variable.map[item.id] = item.value
      }
    }
  }

  /**
   * 获取变量值
   * @param {string} key 变量ID
   * @returns {any}
   */
  get(key) {
    return Variable.map[key]
  }

  /**
   * 设置变量值
   * @param {string} key 变量ID
   * @param {any} value 变量值
   */
  set(key, value) {
    switch (typeof value) {
      case typeof Variable.map[key]:
        Variable.map[key] = value
        break
      case 'object':
        if (key in Variable.map && typeof Variable.map[key] === 'undefined') {
          Variable.map[key] = value
        }
        break
      case 'undefined':
        if (typeof Variable.map[key] === 'object') {
          Variable.map[key] = value
        }
        break
    }
  }

  /**
   * 保存全局变量数据
   * @param {number} groupIndex 变量分组索引(0:常规, 1:共享)
   * @returns {Object}
   */
  saveData(groupIndex) {
    const data = {}
    const group = Variable.groups[groupIndex]
    const length = group.length
    for (let i = 0; i < length; i++) {
      const key = group[i].id
      data[key] = Variable.map[key]
    }
    return data
  }

  /**
   * 加载全局变量数据
   * @param {number} groupIndex 变量分组索引(0:常规, 1:共享)
   * @param {Object} variables 保存的全局变量数据
   */
  loadData(groupIndex, variables) {
    const group = Variable.groups[groupIndex]
    const length = group.length
    for (let i = 0; i < length; i++) {
      const item = group[i]
      const key = item.id
      // 从存档数据中加载变量值
      // 如果类型有效，则写入值
      const value = variables[key]
      const type = typeof item.value
      if (type === typeof value) {
        Variable.map[key] = value
      }
    }
  }
}

// ******************************** 属性管理器 ********************************

const Attribute = new class {
  // 映射表(ID->属性对象)
  idMap = {}

  // 映射表(ID->群组&值->名称)
  groupMap = {}

  /** 初始化属性管理器 */
  initialize() {
    this.unpack(Data.attribute.keys, [])
    delete Data.attribute
  }

  /**
   * 获取属性
   * @param {string} attrId 属性ID
   * @returns {Object|undefined}
   */
  get(attrId) {
    return this.idMap[attrId]
  }

  /**
   * 获取属性名称(未使用)
   * @param {string} attrId 属性ID
   * @returns {string}
   */
  getName(attrId) {
    return this.idMap[attrId]?.name ?? ''
  }

  /**
   * 获取属性键
   * @param {string} attrId 属性ID
   * @returns {string}
   */
  getKey(attrId) {
    return this.idMap[attrId]?.key ?? ''
  }

  /**
   * 获取属性群组
   * @param {string} groupId 群组ID
   * @returns {Object|undefined}
   */
   getGroup(groupId) {
    return this.groupMap[groupId]
  }

  /**
   * 解包属性数据
   * @param {Object[]} items 属性数据列表
   * @param {string[]} groupKeys 群组ID的栈列表
   */
  unpack(items, groupKeys) {
    for (const item of items) {
      const id = item.id
      if (item.children) {
        // 解包文件夹中的属性
        Attribute.groupMap[id] = {}
        groupKeys.push(id)
        this.unpack(item.children, groupKeys)
        groupKeys.pop()
      } else {
        // 构建属性对象映射关系
        this.idMap[id] = item
        if (item.key === '') {
          item.key = id
        }
        // 构建ID->群组&值->名称映射表
        for (const key of groupKeys) {
          Attribute.groupMap[key][item.key] = item.name
        }
      }
    }
  }

  /**
  * 加载属性词条到映射表中
  * @param {Object} map 属性映射表
  * @param {Object[]} entries 属性键值对列表
  */
   loadEntries = (map, entries) => {
    for (const entry of entries) {
      const attr = Attribute.get(entry.key)
      if (attr !== undefined) {
        if (attr.type === 'enum') {
          const enumstr = Enum.get(entry.value)
          if (enumstr !== undefined) {
            map[attr.key] = enumstr.value
          }
        } else {
          map[attr.key] = entry.value
        }
      }
    }
  }

  // 获取属性
  GET = (map, key) => {
    return map[key]
  }

  // 设置属性
  SET = (map, key, value) => {
    map[key] = value
  }

  // 删除属性
  DELETE = (map, key) => {
    delete map[key]
  }

  // 类型安全 - 设置
  SAFE_SET = (map, key, value) => {
    if (Variable.map === map) {
      Variable.set(key, value)
    } else switch (typeof value) {
      case typeof map[key]:
        map[key] = value
        break
      case 'boolean':
      case 'number':
      case 'string':
      case 'object':
        if (typeof map[key] === 'undefined') {
          map[key] = value
        }
        break
      case 'undefined':
        if (typeof map[key] === 'object') {
          map[key] = value
        }
        break
    }
  }

  // 布尔值 - 获取
  BOOLEAN_GET = (map, key) => {
    const value = map[key]
    return typeof value === 'boolean' ? value : undefined
  }

  // 布尔值 - 设置
  BOOLEAN_SET = (map, key, value) => {
    switch (typeof map[key]) {
      case 'boolean':
      case 'undefined':
        map[key] = value
        return
    }
  }

  // 布尔值 - 非
  BOOLEAN_NOT = (map, key, value) => {
    if (typeof map[key] === 'boolean') {
      map[key] = !value
    }
  }

  // 布尔值 - 与
  BOOLEAN_AND = (map, key, value) => {
    if (typeof map[key] === 'boolean') {
      // chrome 85 support: &&=, ||=
      map[key] &&= value
    }
  }

  // 布尔值 - 或
  BOOLEAN_OR = (map, key, value) => {
    if (typeof map[key] === 'boolean') {
      map[key] ||= value
    }
  }

  // 布尔值 - 异或
  BOOLEAN_XOR = (map, key, value) => {
    if (typeof map[key] === 'boolean') {
      map[key] = map[key] !== value
    }
  }

  // 数值 - 获取
  NUMBER_GET = (map, key) => {
    const value = map[key]
    return typeof value === 'number' ? value : undefined
  }

  // 数值 - 设置
  NUMBER_SET = (map, key, value) => {
    switch (typeof map[key]) {
      case 'number':
      case 'undefined':
        map[key] = value
        return
    }
  }

  // 数值 - 加法
  NUMBER_ADD = (map, key, value) => {
    if (typeof map[key] === 'number') {
      map[key] += value
    }
  }

  // 数值 - 减法
  NUMBER_SUB = (map, key, value) => {
    if (typeof map[key] === 'number') {
      map[key] -= value
    }
  }

  // 数值 - 乘法
  NUMBER_MUL = (map, key, value) => {
    if (typeof map[key] === 'number') {
      map[key] *= value
    }
  }

  // 数值 - 除法
  NUMBER_DIV = (map, key, value) => {
    if (typeof map[key] === 'number' && value !== 0) {
      map[key] /= value
    }
  }

  // 数值 - 取余
  NUMBER_MOD = (map, key, value) => {
    if (typeof map[key] === 'number' && value !== 0) {
      map[key] %= value
    }
  }

  // 字符串 - 获取
  STRING_GET = (map, key) => {
    const value = map[key]
    return typeof value === 'string' ? value : undefined
  }

  // 字符串 - 设置
  STRING_SET = (map, key, value) => {
    switch (typeof map[key]) {
      case 'string':
      case 'undefined':
        map[key] = value
        return
    }
  }

  // 字符串 - 加法
  STRING_ADD = (map, key, value) => {
    if (typeof map[key] === 'string') {
      map[key] += value
    }
  }

  // 角色 - 获取
  ACTOR_GET = (map, key) => {
    const value = map[key]
    return value instanceof Actor ? value : undefined
  }

  // 技能 - 获取
  SKILL_GET = (map, key) => {
    const value = map[key]
    return value instanceof Skill ? value : undefined
  }

  // 状态 - 获取
  STATE_GET = (map, key) => {
    const value = map[key]
    return value instanceof State ? value : undefined
  }

  // 装备 - 获取
  EQUIPMENT_GET = (map, key) => {
    const value = map[key]
    return value instanceof Equipment ? value : undefined
  }

  // 物品 - 获取
  ITEM_GET = (map, key) => {
    const value = map[key]
    return value instanceof Item ? value : undefined
  }

  // 触发器 - 获取
  TRIGGER_GET = (map, key) => {
    const value = map[key]
    return value instanceof Trigger ? value : undefined
  }

  // 光源 - 获取
  LIGHT_GET = (map, key) => {
    const value = map[key]
    return value instanceof SceneLight ? value : undefined
  }

  // 元素 - 获取
  ELEMENT_GET = (map, key) => {
    const value = map[key]
    return value instanceof UIElement ? value : undefined
  }

  // 对象 - 获取
  OBJECT_GET = (map, key) => {
    const value = map[key]
    return typeof value === 'object' ? value : undefined
  }

  // 对象 - 设置
  OBJECT_SET = (map, key, value) => {
    switch (typeof map[key]) {
      case 'object':
      case 'undefined':
        map[key] = value ?? undefined
        return
    }
  }

  // 列表 - 获取
  LIST_GET = (map, key) => {
    const value = map[key]
    return Array.isArray(value) ? value : undefined
  }

  // 重置
  RESET = (map) => {
    for (const key of Object.keys(map)) {
      delete map[key]
    }
  }
}

// ******************************** 枚举管理器 ********************************

const Enum = new class {
  // 映射表(ID->字符串对象)
  idMap = {}

  // 映射表(ID->群组&值->名称)
  groupMap = {}

  /** 初始化枚举管理器 */
  initialize() {
    this.unpack(Data.enumeration.strings, [])
    delete Data.enumeration
  }

  /**
   * 获取字符串对象
   * @param {string} stringId 字符串ID
   * @returns {Object|undefined}
   */
  get(stringId) {
    return this.idMap[stringId]
  }

  /**
   * 获取字符串名称(未使用)
   * @param {string} stringId 字符串ID
   * @returns {string}
   */
  getName(stringId) {
    return this.idMap[stringId]?.name ?? ''
  }

  /**
   * 获取字符串值
   * @param {string} stringId 字符串ID
   * @returns {string}
   */
  getValue(stringId) {
    return this.idMap[stringId]?.value ?? ''
  }

  /**
   * 获取枚举字符串群组
   * @param {string} groupId 群组ID
   * @returns {Object|undefined}
   */
  getGroup(groupId) {
    return this.groupMap[groupId]
  }

  /**
   * 解包枚举字符串和群组的数据
   * @param {Object[]} items 枚举字符串列表
   * @param {string[]} groupKeys 群组ID的栈列表
   */
  unpack(items, groupKeys) {
    for (const item of items) {
      const id = item.id
      if (item.children) {
        // 解包文件夹中的字符串对象
        Enum.groupMap[id] = {}
        groupKeys.push(id)
        this.unpack(item.children, groupKeys)
        groupKeys.pop()
      } else {
        // 构建字符串对象映射关系
        this.idMap[id] = item
        if (item.value === '') {
          item.value = id
        }
        // 构建ID->群组&值->名称映射表
        for (const key of groupKeys) {
          Enum.groupMap[key][item.value] = item.name
        }
      }
    }
  }
}