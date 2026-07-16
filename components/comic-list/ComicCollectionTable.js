const ComicCollectionTable = ({
  OriginalCollection,
  block,
  ctx,
  ...collectionProps
}) => {
  return (
    <OriginalCollection
      block={block}
      ctx={ctx}
      {...collectionProps}
    />
  )
}

export default ComicCollectionTable