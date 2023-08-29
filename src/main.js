'use strict'

// ******************************** 游戏对象 ********************************

const Game = new class {
  // 游戏更新器列表
  updaters = new ModuleList()

  // 游戏渲染器列表
  renderers = new ModuleList()

  // 游戏事件侦听器列表
  listeners = {
    ready: [],
    reset: [],
    quit: [],
  }

  /** 初始化游戏 */
  async initialize() {
    // 优先初始化以下内容
    await Promise.all([
      Stage.initialize(),
      Data.loadMeta(),
      Time.initialize(),
      Game.update(Time.timestamp),
    ])

    // 等待数据和字体加载完成
    await Promise.all([
      Data.initialize(),
      Printer.initialize(),
    ])

    // 设置更新器
    Game.updaters = new ModuleList(
      File,
      Input,
      Timer,
      Scene,
      EventManager,
      Trigger,
      UI,
      CacheList,
      Callback,
    )

    // 设置渲染器
    Game.renderers = new ModuleList(
      OffscreenStart,
      Scene,
      OffscreenEnd,
      UI,
    )

    // 初始化组件对象
    AudioManager.initialize()
    Local.initialize()
    Input.initialize()
    Mouse.initialize()
    Controller.initialize()
    UI.initialize()
    Camera.initialize()
    Scene.initialize()
    Actor.initialize()
    ActorCollider.initialize()
    Animation.initialize()
    Trigger.initialize()
    Easing.initialize()
    Team.initialize()
    Variable.initialize()
    Command.initialize()
    EventManager.initialize()
    PluginManager.initialize()
    ErrorReporter.initialize()
    Party.initialize()

    // 侦听exit事件
    window.on('beforeunload', () => {
      Game.emit('quit')
    })

    // 触发ready事件
    Game.emit('ready')

    // 开始游戏
    Game.start()
  }

  /**
   * 更新游戏循环
   * @param {number} timestamp 增量时间(毫秒)
   */
  update(timestamp) {
    // 请求下一帧
    requestAnimationFrame(Game.update)

    // 更新时间
    Time.update(timestamp)

    // 防止Firefox隐藏时运行
    if (document.hidden) {
      return
    }

    // 如果正在同步加载数据
    // 渲染加载进度条并返回
    if (File.updateLoadingProgress()) {
      return File.renderLoadingProgress()
    }

    // 更新数据
    Game.updaters.update(Time.deltaTime)

    // 渲染图形
    Game.renderers.render()
  }

  /** 重置游戏 */
  reset() {
    Time.reset()
    UI.reset()
    Scene.reset()
    Camera.reset()
    Tinter.reset()
    // Callback.reset()
    Variable.reset()
    SelfVariable.reset()
    AudioManager.reset()
    EventManager.reset()
    ActorManager.reset()
    Party.reset()

    // 触发reset事件
    Game.emit('reset')
  }

  /** 开始游戏 */
  start() {
    EventManager.callSpecialEvent('startup')
    EventManager.callAutorunEvents()
  }

  /**
   * 添加游戏事件侦听器
   * @param {string} type 游戏事件类型
   * @param {function} listener 回调函数
   */
  on(type, listener) {
    this.listeners[type].append(listener)
  }

  /**
   * 发送游戏事件
   * @param {string} type 游戏事件类型
   */
  emit(type) {
    for (const listener of this.listeners[type]) {
      listener()
    }
  }

  /** 开关游戏信息显示面板 */
  switchGameInfoDisplay() {
    let {info} = document.body
    if (!info) {
      // 创建统计信息元素
      info = document.createElement('div')
      info.style.position = 'absolute'
      info.style.padding = '4px'
      info.style.left = '0'
      info.style.top = '0'
      info.style.font = '12px sans-serif'
      info.style.color = 'white'
      info.style.backgroundColor = 'rgba(0, 0, 0, 0.5)'
      info.style.pointerEvents = 'none'
      info.style.userSelect = 'none'
      info.style.whiteSpace = 'pre'
      let elapsed = 1000
      // 创建渲染器
      info.renderer = {
        render: () => {
          elapsed += Time.rawDeltaTime
          if (elapsed > 995) {
            elapsed = 0
            // 每秒刷新统计信息文本(可见对象数量只有在渲染时才能获取)
            info.textContent = `${GL.width}x${GL.height}`
            + `\nFPS ${Time.fps}`
            + `\nActors ${Scene.visibleActors.count}/${Scene.actors.length}`
            + `\nAnims ${Scene.visibleAnimations.count}/${Scene.animations.length}`
            + `\nTriggers ${Scene.visibleTriggers.count}/${Scene.triggers.length}`
            + `\nParticles ${Scene.particleCount}`
            + `\nElements ${UI.manager.count}`
            + `\nTextures ${GL.textureManager.count}`
          }
        }
      }
      // 开启：添加统计信息元素和渲染器
      document.body.info = info
      document.body.appendChild(info)
      Game.renderers.add(info.renderer)
      // 立即调用一次渲染方法
      info.renderer.render()
    } else {
      // 关闭：移除统计信息元素和渲染器
      document.body.info = null
      document.body.removeChild(info)
      Game.renderers.remove(info.renderer)
    }
  }
}

// ******************************** 主函数 ********************************

!function main () {
  Game.initialize()
}()