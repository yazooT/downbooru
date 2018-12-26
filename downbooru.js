// ==UserScript==
// @name         downbooru
// @namespace    https://github.com/yazooT/
// @version      0.1
// @description  download images with exif keywords
// @author       You
// @match        https://danbooru.donmai.us/*
// @grant        GM.xmlHttpRequest
// ==/UserScript==

(() => {
    'use strict';

    // ボタンのスタイル
    const styleRule = ".downbooru{"
            + "background: #b8860b;"
            + "position: absolute;"
            + "right: 0;"
            + "bottom: 0;"
            + "padding: 0.5em;"
            + "border: none;"
            + "font-weight: bold;"
            + "border-radius: 3px;"
            + "opacity: 0.6;"
        + "}"
        + ".downbooru-post{"
            + "background: #b8860b;"
            + "padding: 0.5em;"
            + "border: none;"
            + "font-weight: bold;"
            + "border-radius: 3px;"
            + "opacity: 0.6;"
    + "}";

    setCSS(styleRule);
    setButton();
    document.onwheel = (event) => setButton();
    
    /**
     * CSSをhtmlに追加します
     * @param {string} styleRule CSS
     */
    function setCSS(styleRule) {
        const style = document.createElement("style");
        style.setAttribute("type", "text/css");
        style.textContent = styleRule;
        const head = document.querySelector("head");
        head.appendChild(style);
    }

    /**
     * 画像サムネイル上にボタンを設置します
     */
    function setButton() {
        /**
         * 全article要素
         * @type {NodeListOf<HTMLElement>}
         */
        const articles = document.querySelectorAll("article:not([downbooru]), #image-container:not([downbooru])");

        for (const node of articles) {
            node.setAttribute("downbooru", "");

            // ダウンロードに必要なデータの取得
            const name = (() => {
                const id = node.getAttribute("data-id");
                return "danbooru" + id + ".jpg";
            })();
            const url = node.getAttribute("data-file-url");
            const tags = (() => {
                const tagString = node.getAttribute("data-tags");
                return tagString.split(/\s/);
            })();

            // jpeg、png以外はボタンをつけません
            const fileType = url.match(/\.[^\.]+$/)[0];
            if (fileType != ".jpg" && fileType != ".png") { continue }

            const button = createButton();
            // 直接download()を指定するとイベントをセットするときに呼び出されてしまう
            button.addEventListener("click", (event) => { return download(name, url, tags) }, false);

            // ボタンを押したあとボタンを無効化します
            button.addEventListener("click", () => {
                button.disabled = true;
                button.setAttribute("style", "background: #708090; color: #f0f8ff")
            }, false);

            let buttonClass = "";
            let parent;
            if (node.getAttribute("id") == "image-container") {
                buttonClass = "downbooru-post";
                parent = document.querySelector(".fav-buttons");
            } else {
                buttonClass = "downbooru";
                parent = node;
            }

            button.setAttribute("class", buttonClass);
            parent.appendChild(button);
        }
    }

    /**
     *  タグ付き画像をダウンロードします
     * 
     * @param {string} name - ダウンロードする画像につけたい名前
     * @param {string[]} tags - タグのリスト
     * @param {string} url - 画像のURL
     */
    function download(name, url, tags) {
        getRequest(url)
            .then(getImage)
            .then(getDataURL)
            .then(editDataURL)
            .then(dataurl => dataURLtoBlob(dataurl, "image/jpeg"))
            .then(blob => save(name, blob)
        );

        /**
         * 画像のBlobを取得します
         * @param {string} url 取得したい画像のURL
         * @returns {Promise} resolve(Blob)
         */
        function getRequest(url) {
            return new Promise(resolve => {
                GM.xmlHttpRequest({
                    method: "GET",
                    url: url,
                    responseType: "blob",
                    onload: (res) => resolve(res.response)
                });
            })
        }

        /**
         * Blobから画像要素を作ります
         * @param {Blob} blob 
         * @returns {Promise} resolve(Image)
         */
        function getImage(blob) {
            return new Promise(resolve => {
                const img = new Image();
                const url = URL.createObjectURL(blob);
                img.onload = () => {
                    resolve(img);
                }
                img.src = url;
            })
        }

        /**
         * JPEGファイルのData URLを返します
         * @param {HTMLElement} img 画像要素
         * @returns {string} 画像のData URL
         */
        function getDataURL(img) {
            // canvas準備
            const canvas = document.createElement("canvas");

            // 大きさ設定
            canvas.width = img.width;
            canvas.height = img.height;

            // 背景を白く塗りつぶし
            const context = canvas.getContext("2d");
            context.fillStyle = "white";
            context.fillRect(0, 0, canvas.width, canvas.height);

            // 画像貼り付け
            context.drawImage(img, 0, 0);

            return canvas.toDataURL("image/jpeg", 1.0);
        }

        /**
         * 画像にタグ情報を埋め込みます
         * @param {string} dataurl Data URL
         * @returns {string} タグ情報が埋め込まれたData URL
         */
        function editDataURL(dataurl) {
            // ヘッダーとbase64の先頭4文字削除
            const imageBase64 = dataurl.replace(/^data:image\/jpeg;base64,\/9j\//, "");

            // セグメント
            let segment = getSegment();

            // 3の倍数バイトになるよう調整
            for (const a of Array(segment.length % 3).keys()) {
                segment += "FF";
            }
            segment = "FFD8" + segment + "FF";

            // セグメントをBase64化
            const segmentBase64 = (() => {
                const array = segment.replace(/(.{2})/g, "0x$1 ").replace(/\s$/, "").split(/\s/);
                return window.btoa(String.fromCharCode.apply(null, array));
            })();

            return segmentBase64 + imageBase64;
        }

        /**
         * Data URLからBlobを作ります
         * @param {string} dataurl Data URL
         * @param {string} fileType Blobの形式。"image/jpeg"など。
         * @returns {Blob} Blob
         */
        function dataURLtoBlob(dataurl, fileType) {
            const base64 = atob(dataurl);
            const buffer = Uint8Array.from(base64.split(""), e => e.charCodeAt());
            return new Blob([buffer], { type: fileType });
        }

        /**
         *  Blobファイルをダウンロードします
         * @param {string} name ファイルのダウンロード名
         * @param {Blob} blob ダウンロードするBlob
         */
        function save(name, blob) {
            const a = document.createElement("a");
            a.download = name;
            const url = URL.createObjectURL(blob);
            a.href = url
            a.click();

            blob = null;
        }

        /**
         * 与えられたタグリストに基づいたセグメントを返します
         * @returns {string} JPEGセグメントの16進数文字列
         */
        function getSegment() {
            const tagEle = () => {
                const array = [];
                for (let tag of tags) {
                    array.push(new TagElement(tag));
                }
                return array;
            }
            const tagPart = new TagPart(tagEle());
            const segParam = new SegmentParameter(tagPart);
            const segment = new Segment(segParam);

            return segment.str;
        }

        /**
         * タグエレメントオブジェクト
         * @typedef {object} TagElement
         * @property {string} str
         *
         * @constructor
         * @param {string} tagStr - 付加したいタグの単語。半角英数字。
         */
        function TagElement(tagStr) {
            this.str = (() => {
                // マーカー
                const marker = "1C0219";

                // タグ長
                const lengthHex = ("0000" + tagStr.length.toString(16)).slice(-4);

                // タグ文字列
                let tagHex = "";
                for (let i of tagStr.split("")) {
                    tagHex += i.charCodeAt().toString(16);
                }

                return marker + lengthHex + tagHex;
            })()
        }

        /**
         * タグパートオブジェクト
         * @typedef {object} TagPart
         * @property {string} str
         * 
         * @constructor
         * @param {Array.<TagElement>} tagElements
         */
        function TagPart(tagElements) {
            this.str = (() => {
                // ヘッダー
                const header = "1C0100000200041C015A00031B25471C020000020004";

                // タグエレメント
                let eles = "";
                for (let arg of tagElements) {
                    eles += arg.str;
                }

                // フッター
                const footer = "1C020000020004";

                return header + eles + footer;
            })();
        }

        /**
         * セグメントパラメータオブジェクト
         * @typedef {object} SegmentParameter
         * @property {string} str
         * 
         * @constructor
         * @param {TagPart} tagPart 
         */
        function SegmentParameter(tagPart) {
            this.str = (() => {
                // ヘッダー
                const header = "50686F746F73686F7020332E30003842494D040400000000";

                // タグパート長
                const bytes = tagPart.str.length / 2;
                const tagPartLength = ("0000" + bytes.toString(16)).slice(-4);

                return header + tagPartLength + tagPart.str;
            })()
        }

        /**
         * セグメントオブジェクト
         * @typedef {object} Segment
         * @property {string} str
         * 
         * @constructor
         * @param {SegmentParameter} segmentParameter 
         */
        function Segment(segmentParameter) {
            this.str = (() => {
                // マーカー
                const marker = "FFED";

                /**
                 * セグメントの容量、バイト数(マーカーは含まず)
                 * @type {number}
                 */
                const bytes = (segmentParameter.str.length / 2) + 2;
                const length = ("0000" + bytes.toString(16)).slice(-4);

                return marker + length + segmentParameter.str;
            })()
        }
    }

    /**
     * ダウンロードを開始するためのボタンを作ります
     * 
     * @returns {HTMLElement} ボタン要素
     */
    function createButton() {
        const button = document.createElement("button");
        button.textContent = "DL";
        return button;
    }

})();
/*
 * JPEGのタグについて(自分で勝手に命名したもの多数)
 * hogehogeというタグをつけた場合、Exifセグメントはこうなります。
 *
 * ADDRESS   00 01 02 03 04 05 06 07 08 09 0A 0B 0C 0D 0E 0F   0123456789ABCDEF
 * ------------------------------------------------------------------------------
 * 00000000        FF ED 00 5C 50 68 6F 74 6F 73 68 6F 70 20     ...\Photoshop
 * 00000010  33 2E 30 00 38 42 49 4D 04 04 00 00 00 00 00 23   3.0.8BIM.......#
 * 00000020  1C 01 00 00 02 00 04 1C 01 5A 00 03 1B 25 47 1C   .........Z...%G.
 * 00000030  02 00 00 02 00 04 1C 02 19 00 08 68 6F 67 65 68   ...........hogeh
 * 00000040  6F 67 65 1C 02 00 00 02 00 04                     oge.......
 *
 * 先頭から
 * FF ED: セグメントマーカー
 * 00 5C: 16進数で表されたセグメントのバイト数(セグメントマーカーを除く)
 * 00-06以降はセグメントパラメーターとなります。
 *
 * セグメントパラメータは
 * セグメントパラメータ = パラメーターヘッダ + タグパート長 + タグパート
 * という構成になっており、タグパート長、タグパートだけが可変です。
 * タグパート長はタグパートのバイト数です。
 *
 * 更にタグパートは
 * タグパート = タグパートヘッダ + タグエレメント * n + タグパートフッター
 * で成り立っています。
 * タグエレメントにタグの情報が入っており、その構成は
 * タグエレメント = タグマーカー + タグ文字列長 + タグ文字列
 * のようになっています。
 *
 * セグメント/
 *     ├セグメントマーカー
 *     ├セグメント長
 *     └セグメントパラメーター/
 *          ├パラメータヘッダ (00-06): 50 68 6F 74 6F 73 68 6F 70 20 33 2E 30 00 38 42 49 4D 04 04 00 00 00 00
 *          ├タグパート長
 *          └タグパート/
 *               ├タグパートヘッダ (20-00): 1C 01 00 00 02 00 04 1C 01 5A 00 03 1B 25 47 1C 02 00 00 02 00 04
 *               ├タグエレメント/
 *               │    ├タグマーカー (30-06): 1C 02
 *               │    ├タグ文字列長
 *               │    └タグ文字列
 *               └タグパートフッター (40-03): 1C 02 00 00 02 00 04
 */