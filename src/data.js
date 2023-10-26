'use strict'

// ******************************** 数据对象 ********************************

const Data = new class {
  // 游戏数据
  manifest
  actors
  skills
  triggers
  items
  equipments
  states
  events
  scripts
  easings
  teams
  autotiles
  variables
  attribute
  enumeration
  plugins
  commands
  config
  scenes = {}
  ui
  animations
  particles
  tilesets
  globalData

  // 文件名GUID正则表达式
  fileGuidRegExp = /[./]([0-9a-f]{16})\.\S+$/

  /**
   * 初始化数据管理器
   * @returns {Promise}
   */
  initialize() {
    // 侦听窗口关闭前事件
    Game.on('quit', () => {
      Data.saveGlobalData()
    })

    // 加载数据文件
    return Promise.all([
      // 优先加载属性和枚举用于编译事件
      this.loadFile('attribute'),
      this.loadFile('enumeration'),
      this.loadFile('localization'),
      this.loadObjects(),
      this.loadScripts(),
      this.loadFile('easings'),
      this.loadFile('teams'),
      this.loadFile('autotiles'),
      this.loadFile('variables'),
      this.loadFile('plugins'),
      this.loadFile('commands'),
    ]).then(() => {
      this.createAutotileMap()
      this.createEasingMap()
    })
  }

  /**
   * 加载文件的元数据清单
   * @returns {Promise}
   */
  loadMeta() {
    const path = 'Data/manifest.json'
    return File.get({
      path: path,
      type: 'json',
      sync: true,
    }).then(
      data => {
        if (!data) {
          throw new SyntaxError(path)
        }
        return this.manifest = data
      }
    ).then(manifest => {
      // 创建GUID->元数据映射表
      const guidMap = {}
      Object.defineProperty(manifest, 'guidMap', {value: guidMap})
      for (const [key, group] of Object.entries(manifest)) {
        switch (key) {
          case 'scenes':
          case 'images':
          case 'audio':
          case 'videos':
          case 'fonts':
          case 'script':
          case 'others':
            // 处理异步资产文件的元数据
            for (const meta of group) {
              meta.guid = this.parseGUID(meta)
              guidMap[meta.guid] = meta
            }
            break
          default:
            if (!manifest.deployed) {
              // 处理同步资产文件的元数据
              for (const meta of group) {
                meta.guid = this.parseGUID(meta)
              }
            }
            break
        }
      }
    })
  }

  /** 加载各种对象数据文件 */
  async loadObjects() {
    const {manifest} = this
    const idDescriptor = {value: ''}
    const pathDescriptor = {value: ''}
    const filenameDescriptor = {value: ''}
    const idAndPathDescriptors = {
      id: idDescriptor,
      path: pathDescriptor,
    }
    if (manifest.deployed) {
      // 加载已打包的数据
      for (const key of [
        'actors',
        'skills',
        'triggers',
        'items',
        'equipments',
        'states',
        'events',
        'ui',
        'animations',
        'particles',
        'tilesets',
      ]) {
        const group = this[key] = manifest[key]
        for (const [guid, data] of Object.entries(group)) {
          idDescriptor.value = guid
          pathDescriptor.value = `File.${guid}`
          Object.defineProperties(data, idAndPathDescriptors)
        }
      }
    } else {
      // 加载未打包的数据
      const fileDescriptor = {
        path: '',
        type: 'json',
        sync: true,
      }
      const table = [
        ['actors',     {}, null],
        ['skills',     {}, null],
        ['triggers',   {}, null],
        ['items',      {}, null],
        ['equipments', {}, null],
        ['states',     {}, null],
        ['events',     {}, null],
        ['ui',         {}, null],
        ['animations', {}, null],
        ['particles',  {}, null],
        ['tilesets',   {}, null],
      ]
      // 加载所有对象
      for (const row of table) {
        const key = row[0]
        const group = manifest[key]
        const length = group.length
        const promises = new Array(length)
        for (let i = 0; i < length; i++) {
          fileDescriptor.path = group[i].path
          promises[i] = File.get(fileDescriptor)
        }
        row[2] = {group, promises}
      }
      // 等待加载完成并设置ID
      for (const row of table) {
        const key = row[0]
        const map = row[1]
        const {group, promises} = row[2]
        const length = group.length
        for (let i = 0; i < length; i++) {
          const meta = group[i]
          try {
            const data = await promises[i]
            const id = meta.guid
            idDescriptor.value = id
            pathDescriptor.value = meta.path
            Object.defineProperties(data, idAndPathDescriptors)
            map[id] = data
          } catch (error) {
            console.log(`Failed to read file: ${error.message}`)
          }
        }
        this[key] = map
      }
      // 提取技能|物品|装备的文件名(用于排序)
      const guidAndExt = /\.[0-9a-f]{16}\.\S+$/
      for (const key of ['skills', 'items', 'equipments']) {
        const dataMap = this[key]
        for (const {guid, path} of manifest[key]) {
          const item = dataMap[guid]
          if (item !== undefined) {
            const index = path.lastIndexOf('/') + 1
            filenameDescriptor.value = path.slice(index).replace(guidAndExt, '')
            Object.defineProperty(item, 'filename', filenameDescriptor)
          }
        }
      }
    }
    this.precompile()
  }

  /** 预编译对象数据 */
  async precompile() {
    await this.attribute
    await this.enumeration
    Attribute.initialize()
    Enum.initialize()
    this.precompileActors()
    this.precompileSkills()
    this.precompileTriggers()
    this.precompileItems()
    this.precompileEquipments()
    this.precompileStates()
    this.precompileAnimations()
  }

  /** 预编译角色数据 */
  precompileActors() {
    for (const actor of Object.values(this.actors)) {
      actor.idleMotion = Enum.getValue(actor.idleMotion)
      actor.moveMotion = Enum.getValue(actor.moveMotion)
      this.compileEvents(actor, actor.path)
    }
  }

  /** 预编译技能数据 */
  precompileSkills() {
    for (const skill of Object.values(this.skills)) {
      this.compileEvents(skill, skill.path)
    }
  }

  /** 预编译触发器数据 */
  precompileTriggers() {
    for (const trigger of Object.values(this.triggers)) {
      trigger.motion = Enum.getValue(trigger.motion)
      this.compileEvents(trigger, trigger.path)
    }
  }

  /** 预编译物品数据 */
  precompileItems() {
    for (const item of Object.values(this.items)) {
      const {attributes} = item
      Attribute.loadEntries(
        item.attributes = {},
        attributes,
      )
      this.compileEvents(item, item.path)
    }
  }

  /** 预编译装备数据 */
  precompileEquipments() {
    for (const equipment of Object.values(this.equipments)) {
      this.compileEvents(equipment, equipment.path)
    }
  }

  /** 预编译状态数据 */
  precompileStates() {
    for (const state of Object.values(this.states)) {
      this.compileEvents(state, state.path)
    }
  }

  /** 预编译动画数据 */
  precompileAnimations() {
    // 计算动画当前动作的帧数
    const calculateLength = (layers, length) => {
      // 遍历所有图层的尾帧，获取最大长度
      for (const layer of layers) {
        const frames = layer.frames
        const frame = frames[frames.length - 1]
        if (frame !== undefined) {
          length = Math.max(length, frame.end)
        }
        if (layer.class === 'joint') {
          length = calculateLength(layer.children, length)
        }
      }
      return length
    }
    for (const animation of Object.values(this.animations)) {
      // 加载动作哈希表
      const motionMap = {}
      for (const motion of animation.motions) {
        // 设置动作名称
        motion.name = Enum.get(motion.id)?.value ?? motion.id
        // 添加当前动作的方向映射表
        motion.dirMap = Animation.dirMaps[motion.mode]
        // 计算当前动作的动画帧数和循环起始位置
        for (const dirCase of motion.dirCases) {
          const length = calculateLength(dirCase.layers, 0)
          const lastFrame = length - 1
          dirCase.loopStart = motion.loop ? Math.min(motion.loopStart, lastFrame) : 0
          dirCase.length = motion.skip && dirCase.loopStart < lastFrame ? lastFrame : length
        }
        // 添加动作到映射表中
        motionMap[motion.name] = motion
      }
      // 加载精灵哈希表
      const spriteMap = {}
      const imageMap = {}
      // 使用精灵数组生成精灵和图像哈希表
      for (const sprite of animation.sprites) {
        spriteMap[sprite.id] = sprite
        imageMap[sprite.id] = sprite.image
      }
      // 将动作列表替换为名称->动作映射表
      animation.motions = motionMap
      // 将精灵列表替换为精灵ID->精灵图数据映射表
      animation.sprites = spriteMap
      // 添加精灵ID->图像文件ID映射表
      animation.images = imageMap
    }
  }

  /** 加载脚本文件(动态导入模块) */
  async loadScripts() {
    this.remapScripts()
    const promises = []
    const scripts = this.scripts = {}
    // 动态导入所有脚本文件
    for (const meta of this.manifest.script) {
      const promise = import(`../${meta.path}`)
      promise.meta = meta
      promises.push(promise)
    }
    for (const promise of promises) {
      try {
        // 等待导入完成，获取构造函数
        const module = await promise
        const constructor = module.default
        if (typeof constructor === 'function') {
          const {meta} = promise
          constructor.guid = meta.guid
          scripts[meta.guid] = {
            constructor: constructor,
            parameters: meta.parameters ?? [],
          }
        }
      } catch (error) {
        console.error(error)
      }
    }
  }

  /** 重新映射脚本路径(TS->JS) */
  remapScripts() {
    if (this.manifest.deployed) return
    const {outDir} = this.config.script
    const tsExtname = /\.ts$/
    const tsOutDir = outDir.replace(/\/$/, '')
    for (const meta of this.manifest.script) {
      if (tsExtname.test(meta.path)) {
        meta.path = meta.path
        .replace('Assets', tsOutDir)
        .replace(tsExtname, '.js')
      }
    }
  }

  /**
   * 加载数据文件
   * @param {string} filename /data目录下的文件名
   * @returns {Promise<object>}
   */
  loadFile(filename) {
    return this[filename] = File.get({
      path: `Data/${filename}.json`,
      type: 'json',
      sync: true,
    }).then(data => {
      return this[filename] = data
    })
  }

  /**
   * 加载场景数据
   * @param {string} id 场景文件ID
   * @returns {Promise<Object>}
   */
  loadScene(id) {
    // 如果已经存在，返回解码后的场景
    if (this.scenes[id]) {
      return new Promise(resolve => {
        resolve(JSON.parse(this.scenes[id]))
      })
    }
    const meta = this.manifest.guidMap[id]
    if (!meta) {
      // 找不到场景文件的情况
      return new Promise((resolve, reject) => {
        const error = new URIError(`Scene #${id} is missing.`)
        reject(error)
        throw error
      })
    }
    // 加载场景JSON然后解码
    const path = meta.path
    return File.get({
      path: path,
      type: 'text',
      sync: true,
    }).then(code => {
      return JSON.parse(this.scenes[id] = code)
    })
  }

  /**
   * 从元数据中解析文件GUID
   * @param {Object} meta 文件的元数据
   * @returns {string} 文件GUID
   */
  parseGUID(meta) {
    const match = meta.path.match(this.fileGuidRegExp)
    return match ? match[1] : ''
  }

  /** 创建自动图块模板数据映射表 */
  createAutotileMap() {
    const autotiles = {}
    for (const item of this.autotiles) {
      autotiles[item.id] = item
    }
    this.autotiles = autotiles
  }

  /** 创建过渡映射表 */
  createEasingMap() {
    const easings = {}
    const keyRemap = {}
    for (const item of this.easings) {
      easings[item.id] = item
      keyRemap[item.id] = item.id
      if (item.key) {
        keyRemap[item.key] = item.id
      }
    }
    easings.remap = keyRemap
    this.easings = easings
  }

  /**
   * 编译对象中的事件
   * @param {Object} data 对象数据
   * @param {string} eventPath 事件路径
   * @returns {Object} 事件集合
   */
  compileEvents(data, eventPath) {
    const typeMap = {}
    for (const event of data.events) {
      let eventName
      let eventType
      const enumItem = Enum.get(event.type)
      if (enumItem) {
        eventName = enumItem.name
        eventType = enumItem.value
      } else {
        eventName = event.type
        eventType = event.type
      }
      event.commands.path = `@ ${eventPath}\n@ ${eventName}`
      typeMap[eventType] = Command.compile(event.commands)
    }
    return data.events = typeMap
  }

  /**
   * 保存游戏数据到文件
   * @param {string} number 存档编号
   * @param {Object} meta 存档元数据(时间、地点、截图等附加数据)
   * @returns {Promise<undefined>}
   */
  saveGameData(number, meta) {
    const suffix = number.toString().padStart(2, '0')
    const data = {
      playTime: Time.playTime,
      actors: ActorManager.saveData(),
      party: Party.saveData(),
      team: Team.saveData(),
      scene: Scene.saveData(),
      camera: Camera.saveData(),
      variables: Variable.saveData(0),
      selfVariables: SelfVariable.saveData(),
    }
    // MacOS打包缺少写入权限，暂时改成web模式
    let shell = Stats.shell
    if (!Stats.debug && Stats.isMacOS()) {
      shell = 'web'
    }
    switch (shell) {
      case 'electron': {
        const saveDir = File.route('$/Save')
        const metaPath = File.route(`$/Save/save${suffix}.meta`)
        const dataPath = File.route(`$/Save/save${suffix}.save`)
        const metaText = JSON.stringify(meta, null, 2)
        const dataText = JSON.stringify(data, null, 2)
        const fsp = require('fs').promises
        return fsp.stat(saveDir).catch(error => {
          // 如果不存在存档文件夹，创建它
          return fsp.mkdir('Save')
        }).then(() => Promise.all([
          // 异步写入元数据和存档数据
          fsp.writeFile(metaPath, metaText).catch(error => {console.warn(error)}),
          fsp.writeFile(dataPath, dataText).catch(error => {console.warn(error)}),
        ]))
      }
      case 'web': {
        const metaKey = `save${suffix}.meta`
        const dataKey = `save${suffix}.save`
        return Promise.all([
          IDB.setItem(metaKey, meta),
          IDB.setItem(dataKey, data),
        ])
      }
    }
  }

  /**
   * 从文件中加载游戏数据
   * @param {string} number 存档编号
   * @returns {Promise<undefined>}
   */
  async loadGameData(number) {
    const suffix = number.toString().padStart(2, '0')
    let data
    let shell = Stats.shell
    if (!Stats.debug && Stats.isMacOS()) {
      shell = 'web'
    }
    switch (shell) {
      case 'electron':
        // 推迟到栈尾执行
        await void 0
        try {
          // 同步读取存档数据文件
          const path = File.route(`$/Save/save${suffix}.save`)
          const json = require('fs').readFileSync(path)
          data = JSON.parse(json)
        } catch (error) {
          console.warn(error)
          return
        }
        break
      case 'web': {
        const key = `save${suffix}.save`
        data = await IDB.getItem(key)
        break
      }
    }
    Game.reset()
    Time.playTime = data.playTime
    ActorManager.loadData(data.actors)
    Party.loadData(data.party)
    Team.loadData(data.team)
    Scene.loadData(data.scene)
    Camera.loadData(data.camera)
    Variable.loadData(0, data.variables)
    SelfVariable.loadData(data.selfVariables)
    EventManager.callSpecialEvent('loadGame')
  }

  /**
   * 加载存档元数据列表
   * @returns {Promise<Object[]>}
   */
  async loadSaveMeta() {
    const filenames = []
    const promises = []
    const metaname = /^save\d{2}\.meta$/
    const extname = /\.meta$/
    let shell = Stats.shell
    if (!Stats.debug && Stats.isMacOS()) {
      shell = 'web'
    }
    switch (shell) {
      case 'electron': {
        const saveDir = File.route('$/Save')
        const fsp = require('fs').promises
        // 如果不存在存档文件夹，获取空文件列表
        const files = await fsp.readdir(
          saveDir, {withFileTypes: true},
        ).catch(error => [])
        for (const file of files) {
          // 获取所有的meta文件名
          if (file.isFile() && metaname.test(file.name)) {
            filenames.push(file.name)
          }
        }
        // 加载所有meta文件
        for (const filename of filenames) {
          const filepath = File.route(`$/Save/${filename}`)
          promises.push(
            fsp.readFile(filepath, 'utf8').then(
              string => JSON.parse(string)
          ))
        }
        break
      }
      case 'web':
        for (const key of await IDB.getKeys()) {
          if (metaname.test(key)) {
            filenames.push(key)
          }
        }
        for (const filename of filenames.sort()) {
          promises.push(IDB.getItem(filename))
        }
        break
    }
    return Promise.all(promises).then(data => {
      const list = []
      const length = data.length
      for (let i = 0; i < length; i++) {
        // 如果meta数据有效，添加到列表中返回
        if (data[i]) {
          const name = filenames[i].replace(extname, '')
          const index = parseInt(name.slice(-2))
          list.push({
            index: index,
            name: name,
            data: data[i],
          })
        }
      }
      return list
    })
  }

  /**
   * 删除游戏数据存档文件
   * @param {string} number 存档编号
   * @returns {Promise<undefined>}
   */
  deleteGameData(number) {
    const suffix = number.toString().padStart(2, '0')
    let shell = Stats.shell
    if (!Stats.debug && Stats.isMacOS()) {
      shell = 'web'
    }
    switch (shell) {
      case 'electron': {
        const metaPath = File.route(`$/Save/save${suffix}.meta`)
        const dataPath = File.route(`$/Save/save${suffix}.save`)
        const fsp = require('fs').promises
        return Promise.all([
          // 异步删除元数据和存档数据
          fsp.unlink(metaPath).catch(error => {console.warn(error)}),
          fsp.unlink(dataPath).catch(error => {console.warn(error)}),
        ])
      }
      case 'web': {
        const metaKey = `save${suffix}.meta`
        const dataKey = `save${suffix}.save`
        return Promise.all([
          IDB.removeItem(metaKey),
          IDB.removeItem(dataKey),
        ])
      }
    }
  }

  /**
   * 保存全局数据到文件
   * @returns {Promise<undefined>}
   */
  saveGlobalData() {
    const data = {
      language: Local.language,
      canvasWidth: Stage.resolution.width,
      canvasHeight: Stage.resolution.height,
      sceneScale: Scene.scale,
      uiScale: UI.scale,
      variables: Variable.saveData(1),
    }
    let shell = Stats.shell
    if (!Stats.debug && Stats.isMacOS()) {
      shell = 'web'
    }
    switch (shell) {
      case 'electron': {
        const saveDir = File.route('$/Save')
        const path = File.route('$/Save/global.save')
        const json = JSON.stringify(data, null, 2)
        const fs = require('fs')
        // 如果不存在存档文件夹，创建它
        if (!fs.existsSync(saveDir)) {
          fs.mkdirSync(saveDir)
        }
        // 异步写入全局数据文件
        return fs.writeFileSync(path, json)
      }
      case 'web': {
        const key = 'global.save'
        return IDB.setItem(key, data)
      }
    }
  }

  /**
   * 从文件中加载全局数据
   * @returns {Promise<undefined>}
   */
  async loadGlobalData() {
    Game.on('ready', () => {
      delete this.globalData
    })
    // 创建默认全局数据
    const createDefaultData = async () => {
      const config = await this.config
      return {
        language: config.localization.default,
        canvasWidth: config.resolution.width,
        canvasHeight: config.resolution.height,
        sceneScale: config.resolution.sceneScale,
        uiScale: config.resolution.uiScale,
        variables: {},
      }
    }
    let shell = Stats.shell
    if (!Stats.debug && Stats.isMacOS()) {
      shell = 'web'
    }
    switch (shell) {
      case 'electron':
        try {
          const path = File.route('$/Save/global.save')
          const fsp = require('fs').promises
          const json = await fsp.readFile(path)
          this.globalData = JSON.parse(json)
        } catch (error) {}
        break
      case 'web':
        this.globalData = await IDB.getItem('global.save')
        break
    }
    const defaultData = await createDefaultData()
    // 如果存在全局数据，检查并修补缺失的属性
    // 否则使用默认全局数据
    if (this.globalData) {
      for (const key of Object.keys(defaultData)) {
        if (this.globalData[key] === undefined) {
          this.globalData[key] = defaultData[key]
        }
      }
      // 以调试模式运行时重置部分数据
      if (Stats.debug) {
        for (const key of [
          'language',
          'canvasWidth',
          'canvasHeight',
          'sceneScale',
          'uiScale'
        ]) {
          this.globalData[key] = defaultData[key]
        }
      }
    } else {
      this.globalData = defaultData
    }
  }

  // 加载配置文件
  async loadConfig() {
    this.config = File.get({
      path: 'Data/config.json',
      type: 'json',
      sync: true,
    })
    this.config = await this.config
  }
}

// ******************************** 索引数据库封装对象 ********************************

const IDB = new class {
  // 数据库Promise
  promise

  /**
   * 打开数据库
   * @returns {Promise<IDBObjectStore>}
   */
  async open() {
    if (!this.promise) {
      // localStorage数据容量有限，indexedDB可以存放大量数据
      const config = await Data.config
      const dbName = 'yami-rpg:' + config.gameId
      const request = indexedDB.open(dbName)
      request.onupgradeneeded = event => {
        const db = event.target.result
        db.createObjectStore('game-data', {keyPath: 'key'})
      }
      this.promise = new Promise(resolve => {
        request.onsuccess = event => {
          resolve(event.target.result)
        }
      })
    }
    const db = await this.promise
    const transaction = db.transaction(['game-data'], 'readwrite')
    return transaction.objectStore('game-data')
  }

  /**
   * 获取所有数据键(游戏存档文件名)
   * @returns {Promise<string[]>} 键列表
   */
  getKeys() {
    return new Promise(resolve => {
      this.open().then(objectStore => {
        const request = objectStore.getAllKeys()
        request.onsuccess = event => {
          resolve(event.target.result)
        }
      })
    })
  }

  /**
   * 获取数据内容
   * @param {string} key 键(存档文件名)
   * @returns {Promise<any>} 读取的数据
   */
  getItem(key) {
    return new Promise(resolve => {
      this.open().then(objectStore => {
        const request = objectStore.get(key)
        request.onsuccess = event => {
          resolve(event.target.result?.value)
        }
      })
    })
  }

  /**
   * 设置数据内容
   * @param {string} key 键(存档文件名)
   * @param {any} value 写入的数据
   * @returns {Promise<undefined>}
   */
  setItem(key, value) {
    return new Promise(resolve => {
      this.open().then(objectStore => {
        const request = objectStore.put({key, value})
        request.onsuccess = event => {
          resolve()
        }
      })
    })
  }

  /**
   * 移除数据内容
   * @param {string} key 键(存档文件名)
   * @returns {Promise<undefined>}
   */
  removeItem(key) {
    return new Promise(resolve => {
      this.open().then(objectStore => {
        const request = objectStore.delete(key)
        request.onsuccess = event => {
          resolve()
        }
      })
    })
  }
}