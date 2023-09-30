<!--
 * @Author: xuranXYS
 * @LastEditTime: 2023-09-30 15:09:36
 * @GitHub: www.github.com/xiaoxustudio
 * @WebSite: www.xiaoxustudio.top
 * @Description: By xuranXYS
-->
# data.js

```js
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
...
```
它首先定义了一个Data的类  
从结构上我们可以推断出它大概是存放各种数据的类

我们先看下它的初始化事件  
``` js
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
      this.loadGlobalData()
    ]).then(() => {
      this.createAutotileMap()
      this.createEasingMap()
    })
  }
```

首先是加了个关闭的监听事件，如果窗口关闭就保存数据  
然后是使用promise.all等待各个加载事件，因为是使用的promise.all，所以我们推断出这些加载事件都是使用的promise来返回结果的  
最后是创建了自动图块映射表和创建过渡映射表，根据作者注释我们也知道为什么最后才创建这两个东西  
  
  `loadFile`方法出现的很多，我们看看它到底干了什么
```js
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
```


使用了File.get来读取文件，最后返回读取的结果
我们大概去看看File类里面的get方法是怎么封装的
```js
  /**
   * 获取文件
   * @param {Object} descriptor 文件描述器
   * @returns {Promise<Object|Image|null>}
   */
get(descriptor) {
    // 可以指定路径或GUID来加载文件
    const path = descriptor.path ?? this.getPathByGUID(descriptor.guid)
    const sync = descriptor.sync
    const type = descriptor.type
    switch (type) {
      case 'image': {
        const {loadingPromises} = this
        // 如果当前图像已在加载中，则返回Promise，否则新建
        return loadingPromises[path] || (
        loadingPromises[path] = new Promise(async resolve => {
          const image = new Image()
          // 给图像元素设置guid用于纹理的查找
          image.guid = descriptor.guid ?? ''
          let url = path
          let callback
                  ...
```
大概意思就是传入的是一个对象，里面描述了文件的路径和类型，还有是否是同步
然后根据路径或者是GUID读取文件  
  
回到我们的Data类，我们知道了loadfile也是一样的操作，只是加了读取的模板用于读取对应的json文件
然后我们发现了两个不一样的加载
```js
this.loadObjects(),
this.loadScripts(),
```
我们首先看看`loadObjects`方法是如何写的
