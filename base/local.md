<!--
 * @Author: xuranXYS
 * @LastEditTime: 2023-10-03 12:24:22
 * @GitHub: www.github.com/xiaoxustudio
 * @WebSite: www.xiaoxustudio.top
 * @Description: By xuranXYS
-->
# local.js文件  

其实从文件名称我们就知道这个文件是操作本地化对象的  
打开文件我们可以看到直接是创建了一个`Local`类，一直到文件最后  

看一下全局属性
```js
 /** 激活的语言
   *  @type {string}
   */ active = ''

  /** 选择的语言
   *  @type {string}
   */ language = ''

  /** 文本映射表
   *  @type {Object}
   */ textMap = {}

  /** 引用标签的正则表达式
   *  @type {RegExp}
   */ refRegexp = /<ref:([0-9a-f]{16})>/g

   // 语言重映射表
  langRemap = {
    'zh-HK': 'zh-TW',
    'zh-SG': 'zh-TW',
  }
  ...
```
额，注释好像都很清楚，最下面语言重映射表应该是对特定的语言进行重新映射  

一样，我们先从初始化开始看  
```js
// 初始化
  initialize() {
    this.createTextMap()
    this.compileTextContents()
    this.setLanguage(Stats.debug
    ? Data.config.localization.default
    : Data.globalData.language
    )
  }
```
根据这三个函数，我们大概知道  
首先是创建文字映射  
其次是编译文本内容  
最后就是设置语言  

那么我们一下`this.createTextMap()`是怎么写的  
```js
// 创建本地化映射表
  createTextMap() {
    const map = this.textMap
    const set = (items) => {
      for (const item of items) {
        if (item.children) {
          set(item.children)
        } else {
          map[item.id] = item
        }
      }
    }
    set(Data.localization.list)
  }
```
可以看到，首先是将`this.textMap`重新赋值到map  
然后写了个set函数，传入一个items，对这个items进行遍历  
如果item有`children`这个属性，就循环调用set  
没有的话就在map里面添加id，值为item  
（什么时候有`children`属性呢，就是我们在本地化创建文件夹的时候）  

```json
[
    {
        "class": "folder",
        "name": "测试",
        "expanded": true,
        "children": [
            {
                "id": "ba896ccbb9c87bc8",
                "name": "",
                "contents": {
                    "en": "hello",
                    "zh-CN": "新的开始"
                }
            }
        ]
    }
]
```
假如我们有如上数据，那么最后map里面的值就会是  
```json
// map
{
    "ba896ccbb9c87bc8":{
        "id": "ba896ccbb9c87bc8",
        "name": "",
        "contents": {
            "en": "hello",
            "zh-CN": "新的开始"
        }
    }
}
```
最后我们设置了`Data.localization.list`来进行解析  

ok，那么继续看一下`this.compileTextContents()`的代码  
```js
// 编译文本内容
  compileTextContents() {
    const regexp = /<global:([0-9a-f]{16})>/g
    const compile = content => {
      const slices = []
      const setters = []
      let li = 0
      let match
      while (match = regexp.exec(content)) {
        const mi = match.index
        if (mi > li) {
          slices.push(content.slice(li, mi))
        }
        const index = slices.length
        const key = match[1]
        const getter = () => Variable.get(key)
        const setter = () => slices[index] = getter()
        setters.push(setter)
        slices.push('')
        li = regexp.lastIndex
      }
      // 无匹配标签的情况
      if (li === 0) {
        return content
      }
      // 找到标签的情况
      if (content.length > li) {
        slices.push(content.slice(li))
      }
      return () => {
        for (const setter of setters) {
          setter()
        }
        return slices.join('')
      }
    }
    const languages = Data.config.localization.languages
    for (const {contents} of Object.values(this.textMap)) {
      for (const language of languages) {
        contents[language] = compile(contents[language])
      }
    }
  }
```
别看这么长，其实可以分开看  
首先是定义了个正则（目的是获取变量），然后创建了个方法`compile`，分析一下这个方法干了什么  
首先是给我们一个内容的参数，使用循环匹配正则，匹配到了之后就会分割我们的内容，并且将相应位置的变量内容替换成空字符串''   
`index`则存储`slices`（数组）的长度  
`key`匹配了我们的变量id  
`setters`再存储一个将`slices`的`index`的内容替换成`getter`的函数，所以我们刚才替换成的空字符串则会被替换成这个变量内容  
而`getter`函数正是通过`Variable.get`方法来获取变量内容的
最后li存储正则最后一次的index  

后面的也很清楚，它会使用li的值来判断，为0，则没有正则运行（没有使用变量），直接返回内容  
有的话则在`slices`上加上`content.slice(li)`  

啊，为什么要有这段代码  
因为我们这里的`while`匹配正则的过程中只处理了前段，中段（匹配到的内容），后段则没有处理  
但我们不可能在这个循环里面处理后段，因为我们不知道后段还有没有我们需要匹配到的内容  
讲了这么多，其实就是`while`循环最后，未解析的会剩余最后匹配的位置到文本最后的内容没有处理  
所以我们将这段加在`slices`末尾就可以  

最后返回的话是个函数（匿名），遍历setters并运行，最后拼接slices并返回，所以这个函数最终会返回处理好的文本  

ok，看看方法`compile`剩下的代码
```js
const languages = Data.config.localization.languages
    for (const {contents} of Object.values(this.textMap)) {
      for (const language of languages) {
        contents[language] = compile(contents[language])
      }
    }
```
这个就是遍历我们之前所编译的文本映射  
里面会遍历我们的语言组，判断它的语言是否在我们所设置的语言（设置的语言肯定是我们已经设置好了的）内  
那么就会将`contents`对应`language`赋值`compile(contents[language])`函数（这里还没运行）  
所以在指定位置运行一下就是我们本地化后的文本

再往下看有个setLanguage方法，是个异步方法，我也不知道为啥是个异步方法  
直到我问了引擎作者  
![](../img/base/start/fzzt.png)  

好好好，这么玩是吧。（`后期应该会删除`）  

看看源码  
```js
// 设置语言
  async setLanguage(language) {
    if (this.language !== language) {
      const languages = Data.config.localization.languages
      let active = language
      if (active === 'auto') {
        active = this.getLanguage()
      }
      if (!languages.includes(active)) {
        active = languages[0] ?? 'en'
      }
      if (languages.includes(active)) {
        try {
          this.active = active
          this.language = language
          this.updateAllTexts()
          window.dispatchEvent(new window.Event('localize'))
        } catch (error) {
          console.error(error)
        }
      }
    }
  }
```
ok，首先看到它判断了我们要设置的语言是否和现在所设置的语言是否不一致，不一致致才进行设置操作  
如何判断传进来的语言是否是`auto`，是的话就用`this.getLanguage()`方法获取语言并赋值`active`  
下面if语句就判断`languages`里存在`active`，否则就不执行，如果不存在的话就设置为`languages`的`index`为0的语言  
如果它也为空，那么就设置成`en`  
下面具体操作如果在内置的`languages`里存在`active`的语句  
那么会使用一个`try...catch`语句块来捕获异常  
首先设置了本地的`active`为传进来的`active`  
然后设置本地的`languages`为传进来的`languages`（其实这俩用的是一个变量）  

然后执行了下面这两条语句，最下面的`windwos.dispatchEvent`意思是发出发射这个事件  
我们新建了一个`localize`的窗口事件，所以就发射了它
```js
this.updateAllTexts()
window.dispatchEvent(new window.Event('localize'))
```
那`this.updateAllTexts()`是什么意思  
翻到最后，你会发现这段代码  
```js
 // 更新所有文本
  updateAllTexts() {
    const update = elements => {
      for (const element of elements) {
        element.updateTextContent?.()
        update(element.children)
      }
    }
    if (UI.root instanceof UIElement) {
      update(UI.root.children)
    }
  }
```
是的，它会执行UI控件上面所有的`updateTextContent`方法，包括该控件的子控件
所以我们大致推断出`updateTextContent`方法是更新文本的函数。  

继续分析，往下是`getLanguage`方法  
```js
// 获取语言
  getLanguage() {
    const languages = Data.config.localization.languages
    let language = languages[0] ?? 'en'
    let matchedWeight = 0
    let nLanguage = navigator.language
    // 重映射本地语言
    if (this.langRemap[nLanguage]) {
      nLanguage = this.langRemap[nLanguage]
    }
    const sKeys = nLanguage.split('-')
    for (const key of languages) {
      const dKeys = key.split('-')
      if (sKeys[0] === dKeys[0]) {
        let weight = 0
        for (let sKey of sKeys) {
          if (dKeys.includes(sKey)) {
            weight++
          }
        }
        if (matchedWeight < weight) {
          matchedWeight = weight
          language = key
        }
      }
    }
    return language
  }
```
前面没啥可讲的，可以看到重新映射了我们的语言，这用到了我们开头看到的`langRemap`变量  
可以看到后面分割了`nLanguage`变量，因为这个变量存储了我们的当前环境下的选择的语言  
那为啥要分割呢，因为我们有些语言是有`-`符号的，比如zh-cn、zh-TW等  
for循环就是判断两个字符串是否相似，因为下面又分割一个字符串  
通过`key.split('-')`将当前遍历到的语言标签 key 按照连字符 - 分割成一个字符串数组 dKeys，例如将 'en-US' 划分为 ['en', 'US']。  
接下来，通过比较 sKeys[0]（给定语言 sKeys 的第一个元素）和 dKeys[0]（当前遍历到的语言标签 key 的第一个元素）是否相等，来判断主要语言代码是否匹配。  
如果主要语言代码匹配，则进一步比较 sKeys 和 dKeys 中的子语言代码，如果 dKeys 包含了 sKeys 中的某些子语言代码，则增加计数器 weight。  
最后，在内层循环结束后，将 `matchedWeight`（当前找到的最大匹配权重）与 weight 进行比较。如果当前 weight 大于 `matchedWeight`，则更新 `matchedWeight` 和 `language` 分别为当前的 weight 和 key，表示找到了更匹配的语言。  
最后返回语言

其他的方法注释也很清楚，那就分析到这。

