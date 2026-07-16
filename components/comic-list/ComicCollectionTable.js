const ComicCollectionTable = ({
  OriginalCollection,
  block,
  ctx,
  ...collectionProps
}) => {
  /*
   * 目前只验证目标数据库是否能
   * 正确进入这个组件。
   *
   * 暂时仍使用 react-notion-x
   * 原版 Collection 渲染数据库。
   */
  return (
    <div data-comic-collection='true'>
      <OriginalCollection
        block={block}
        ctx={ctx}
        {...collectionProps}
      />
    </div>
  )
}

export default ComicCollectionTable