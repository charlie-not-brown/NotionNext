const SmartCollection = ({
  OriginalCollection,
  pageId,
  ...collectionProps
}) => {
  /*
   * 目前是第一阶段：
   * 暂时不改变任何数据库的渲染方式。
   *
   * 所有数据库继续交给 react-notion-x
   * 原版 Collection 渲染。
   */
  return (
    <OriginalCollection
      {...collectionProps}
    />
  )
}

export default SmartCollection